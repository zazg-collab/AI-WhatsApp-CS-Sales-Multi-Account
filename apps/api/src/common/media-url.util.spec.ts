import { BadRequestException } from '@nestjs/common';
import { assertSafeMediaUrl } from './media-url.util';

describe('assertSafeMediaUrl', () => {
  it('allows public http/https URLs', () => {
    expect(assertSafeMediaUrl('https://cdn.example.com/a.jpg')).toContain('example.com');
    expect(assertSafeMediaUrl('http://example.com/b.pdf')).toContain('example.com');
  });

  it('rejects non-http protocols', () => {
    expect(() => assertSafeMediaUrl('file:///etc/passwd')).toThrow(BadRequestException);
    expect(() => assertSafeMediaUrl('ftp://example.com/x')).toThrow(BadRequestException);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeMediaUrl('not a url')).toThrow(BadRequestException);
  });

  it('rejects loopback and metadata hosts', () => {
    expect(() => assertSafeMediaUrl('http://localhost/x')).toThrow(BadRequestException);
    expect(() => assertSafeMediaUrl('http://127.0.0.1/x')).toThrow(BadRequestException);
    expect(() => assertSafeMediaUrl('http://169.254.169.254/latest/meta-data')).toThrow(BadRequestException);
  });

  it('rejects private network ranges', () => {
    expect(() => assertSafeMediaUrl('http://10.0.0.5/x')).toThrow(BadRequestException);
    expect(() => assertSafeMediaUrl('http://192.168.1.10/x')).toThrow(BadRequestException);
    expect(() => assertSafeMediaUrl('http://172.16.5.5/x')).toThrow(BadRequestException);
  });
});
