import { BadRequestException } from '@nestjs/common';

/**
 * Validate an outbound media URL before handing it to the WhatsApp gateway
 * (M2 — SSRF / local-file read). Baileys fetches the URL server-side, so an
 * unchecked value like `file:///etc/passwd` or `http://169.254.169.254/...`
 * could read local files or hit cloud metadata endpoints.
 *
 * We allow only http/https and reject loopback, link-local, and private hosts.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // cloud metadata
  'metadata.google.internal',
]);

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function assertSafeMediaUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Invalid media URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Media URL must use http or https');
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || isPrivateIpv4(host)) {
    throw new BadRequestException('Media URL host is not allowed');
  }
  return url;
}
