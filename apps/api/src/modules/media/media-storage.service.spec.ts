import { NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaStorageService, contentTypeForExt } from './media-storage.service';

function cfg(values: Record<string, string>) {
  return { get: (k: string) => values[k] } as any;
}

describe('contentTypeForExt', () => {
  it('maps known extensions and falls back to octet-stream', () => {
    expect(contentTypeForExt('jpg')).toBe('image/jpeg');
    expect(contentTypeForExt('PDF')).toBe('application/pdf');
    expect(contentTypeForExt('xyz')).toBe('application/octet-stream');
  });
});

describe('MediaStorageService (local driver)', () => {
  let dir: string;
  let svc: MediaStorageService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'media-'));
    svc = new MediaStorageService(cfg({ WA_MEDIA_DIR: dir }));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('saves bytes and returns a /media/<uuid>.<ext> url', async () => {
    const { key, url } = await svc.save(Buffer.from('hello'), 'png');
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(url).toBe(`/media/${key}`);
  });

  it('round-trips: save then read returns the same bytes', async () => {
    const { key } = await svc.save(Buffer.from('roundtrip'), 'pdf');
    const back = await svc.read(key);
    expect(back.toString()).toBe('roundtrip');
  });

  it('read throws NotFound for a missing key', async () => {
    await expect(svc.read('missing.png')).rejects.toThrow(NotFoundException);
  });
});

describe('MediaStorageService (s3 driver config guard)', () => {
  it('refuses to start without bucket/credentials', () => {
    expect(() => new MediaStorageService(cfg({ MEDIA_STORAGE_DRIVER: 's3' }))).toThrow(
      /MEDIA_S3_BUCKET/,
    );
  });
});
