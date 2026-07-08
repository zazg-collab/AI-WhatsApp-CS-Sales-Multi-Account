import { BadRequestException } from '@nestjs/common';

/**
 * Text extraction for knowledge-base ingestion: PDF / Word / Excel / CSV /
 * plain-text files and web pages, normalised to plain text and chunked so a
 * single huge document can't blow up the AI prompt.
 */

// Per-item chunk size (chars). Items feed the prompt verbatim, so keep each
// one comfortably small; very large documents become multiple items.
export const CHUNK_CHARS = 8_000;
// Hard cap on total extracted text per document.
export const MAX_EXTRACT_CHARS = 80_000;

export interface ExtractedDoc {
  /** Cleaned plain text (capped at MAX_EXTRACT_CHARS). */
  text: string;
  /** Human label of the detected format, e.g. "pdf". */
  kind: string;
}

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACT_CHARS);
}

/** Strip an HTML document down to its readable text. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const withBreaks = withoutBlocks
    .replace(/<\/(p|div|li|h[1-6]|tr|table|section|article|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return normalise(decoded);
}

/** Pull the <title> out of an HTML document, if any. */
export function htmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = m?.[1]?.replace(/\s+/g, ' ').trim();
  return title || null;
}

/** Split long text into chunks on paragraph/sentence boundaries when possible. */
export function chunkText(text: string, chunkChars = CHUNK_CHARS): string[] {
  if (text.length <= chunkChars) return text ? [text] : [];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > chunkChars) {
    // Prefer to break at a paragraph, then a sentence, then hard-cut.
    let cut = rest.lastIndexOf('\n\n', chunkChars);
    if (cut < chunkChars * 0.5) cut = rest.lastIndexOf('. ', chunkChars);
    if (cut < chunkChars * 0.5) cut = chunkChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function extOf(filename: string): string {
  return (filename.split('.').pop() ?? '').toLowerCase();
}

function extFromMime(mimeType?: string): string {
  const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/csv': 'csv',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/html': 'html',
    'application/html': 'html',
    'application/json': 'json',
  };
  return map[mime] ?? '';
}

/**
 * Extract plain text from an uploaded document. Format is detected from the
 * file extension (more reliable than browser-supplied mimetypes).
 */
export async function extractFromFile(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<ExtractedDoc> {
  const detectedExt = extOf(filename);
  const supportedExts = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'csv', 'json', 'html', 'htm']);
  const ext = supportedExts.has(detectedExt) ? detectedExt : extFromMime(mimeType);

  if (ext === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    return { text: normalise(parsed.text ?? ''), kind: 'pdf' };
  }

  if (ext === 'docx' || ext === 'doc') {
    if (ext === 'doc') {
      throw new BadRequestException(
        'Format .doc lama tidak didukung — simpan ulang sebagai .docx',
      );
    }
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { text: normalise(result.value ?? ''), kind: 'word' };
  }

  if (ext === 'xls') {
    throw new BadRequestException(
      'Format Excel lama (.xls) tidak didukung. Simpan ulang sebagai .xlsx lalu unggah kembali.',
    );
  }

  if (ext === 'xlsx') {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const parts: string[] = [];
    workbook.eachSheet((sheet) => {
      const lines: string[] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          const text = (cell.text ?? '').toString();
          cells.push(/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
        });
        lines.push(cells.join(','));
      });
      const csv = lines.join('\n');
      if (csv.trim()) parts.push(`# Sheet: ${sheet.name}\n${csv}`);
    });
    return { text: normalise(parts.join('\n\n')), kind: 'excel' };
  }

  if (['txt', 'md', 'csv', 'json'].includes(ext)) {
    return { text: normalise(buffer.toString('utf8')), kind: ext };
  }

  if (ext === 'html' || ext === 'htm') {
    return { text: htmlToText(buffer.toString('utf8')), kind: 'html' };
  }

  throw new BadRequestException(
    `Tipe file .${ext || '?'} tidak didukung (pdf, docx, xlsx/xls, csv, txt, md, html)`,
  );
}
