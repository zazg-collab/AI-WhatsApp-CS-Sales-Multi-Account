import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

export interface StoredMedia {
  /** Opaque storage key, e.g. "<uuid>.jpg". Persisted on the message. */
  key: string;
  /**
   * What the frontend should load. For local/proxied storage this is the
   * API-relative "/media/<key>"; for a public bucket it may be an absolute URL.
   */
  url: string;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  amr: 'audio/amr',
  pdf: 'application/pdf',
};

export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPES[ext.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Stores chat media behind a driver chosen by env so the same call site works
 * for a single box (local disk) or a horizontally-scaled deploy (S3/Supabase
 * Storage, which is S3-compatible).
 *
 *   MEDIA_STORAGE_DRIVER = local (default) | s3
 *
 * Local: files live under WA_MEDIA_DIR and are streamed by MediaController.
 * S3:    objects are PUT to MEDIA_S3_BUCKET; reads are streamed back through
 *        MediaController (so the bucket can stay private and access stays a
 *        capability URL). Set MEDIA_S3_PUBLIC_BASE_URL to serve straight from a
 *        public/CDN bucket instead of proxying.
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly localDir: string;
  private readonly s3?: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    this.driver =
      config.get<string>('MEDIA_STORAGE_DRIVER') === 's3' ? 's3' : 'local';
    this.localDir = resolve(
      config.get<string>('WA_MEDIA_DIR') ?? './.wa-media',
    );
    this.bucket = config.get<string>('MEDIA_S3_BUCKET') ?? '';
    this.keyPrefix = (config.get<string>('MEDIA_S3_PREFIX') ?? '').replace(
      /^\/+|\/+$/g,
      '',
    );
    this.publicBaseUrl = (
      config.get<string>('MEDIA_S3_PUBLIC_BASE_URL') ?? ''
    ).replace(/\/+$/, '');

    if (this.driver === 's3') {
      const endpoint = config.get<string>('MEDIA_S3_ENDPOINT');
      const region = config.get<string>('MEDIA_S3_REGION') ?? 'us-east-1';
      const accessKeyId = config.get<string>('MEDIA_S3_ACCESS_KEY_ID') ?? '';
      const secretAccessKey =
        config.get<string>('MEDIA_S3_SECRET_ACCESS_KEY') ?? '';
      if (!this.bucket || !accessKeyId || !secretAccessKey) {
        throw new Error(
          'MEDIA_STORAGE_DRIVER=s3 requires MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID and MEDIA_S3_SECRET_ACCESS_KEY',
        );
      }
      this.s3 = new S3Client({
        region,
        endpoint: endpoint || undefined,
        forcePathStyle: Boolean(endpoint), // Supabase/MinIO need path-style
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(`Media storage: s3 bucket=${this.bucket}`);
    } else {
      this.logger.log(`Media storage: local dir=${this.localDir}`);
    }
  }

  /** Persist bytes and return the storage key + a URL the frontend can load. */
  async save(buffer: Buffer, ext: string): Promise<StoredMedia> {
    const key = `${randomUUID()}.${ext}`;
    if (this.driver === 's3' && this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          Body: buffer,
          ContentType: contentTypeForExt(ext),
        }),
      );
      const url = this.publicBaseUrl
        ? `${this.publicBaseUrl}/${this.objectKey(key)}`
        : `/media/${key}`;
      return { key, url };
    }
    await mkdir(this.localDir, { recursive: true });
    await writeFile(join(this.localDir, key), buffer);
    return { key, url: `/media/${key}` };
  }

  /** Read bytes back for MediaController to stream (local or proxied S3). */
  async read(key: string): Promise<Buffer> {
    if (this.driver === 's3' && this.s3) {
      try {
        const res = await this.s3.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
        );
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) throw new Error('empty body');
        return Buffer.from(bytes);
      } catch {
        throw new NotFoundException();
      }
    }
    try {
      return await readFile(join(this.localDir, key));
    } catch {
      throw new NotFoundException();
    }
  }

  private objectKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}/${key}` : key;
  }
}
