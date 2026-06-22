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
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  // URL.hostname keeps IPv6 in brackets; strip them.
  let h = host.replace(/^\[|\]$/g, '').toLowerCase();
  // IPv4-mapped, dotted form (::ffff:169.254.169.254) — defer to the v4 check.
  const mappedDotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return isPrivateIpv4(mappedDotted[1]);
  // IPv4-mapped, hex form (Node normalizes to ::ffff:a9fe:a9fe). Decode the
  // trailing two 16-bit groups back to dotted IPv4 and re-check.
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    return isPrivateIpv4(dotted);
  }
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80')) return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local fc00::/7
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
  if (BLOCKED_HOSTNAMES.has(host) || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new BadRequestException('Media URL host is not allowed');
  }
  return url;
}
