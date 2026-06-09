import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

const SCRIPT_TAG_PATTERN = /<\/?script[^>]*>/gi;
const HTML_EVENT_PATTERN = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;
const JAVASCRIPT_URL_PATTERN = /javascript:/gi;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

@Injectable()
export class SanitizationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (!['body', 'query', 'param'].includes(metadata.type)) return value;
    return this.sanitize(value);
  }

  private sanitize(value: unknown): unknown {
    if (typeof value === 'string') return this.sanitizeString(value);
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          this.sanitizeString(key),
          this.sanitize(item),
        ]),
      );
    }
    return value;
  }

  private sanitizeString(value: string) {
    return value
      .replace(CONTROL_CHARS_PATTERN, '')
      .replace(SCRIPT_TAG_PATTERN, '')
      .replace(HTML_EVENT_PATTERN, '')
      .replace(JAVASCRIPT_URL_PATTERN, '')
      .trim();
  }
}
