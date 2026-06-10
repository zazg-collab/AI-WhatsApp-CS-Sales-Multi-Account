import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { stat } from 'fs/promises';
import { join, resolve } from 'path';

// Only files WaService itself wrote: <uuid v4>.<short ext>. Anything else —
// path traversal, dotfiles, session files — can never match.
const SAFE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

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

/**
 * Serves inbound WhatsApp media downloaded by WaService.
 *
 * Intentionally unauthenticated: <img>/<audio>/<video> tags cannot attach a
 * JWT header. Access control is the capability URL — filenames are random
 * UUIDs generated server-side, never enumerable and shared only inside the
 * authenticated chat payload.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  private readonly mediaDir: string;

  constructor(config: ConfigService) {
    this.mediaDir = resolve(config.get<string>('WA_MEDIA_DIR') ?? './.wa-media');
  }

  @ApiOperation({ summary: 'Serve a downloaded inbound media file' })
  @Get(':filename')
  async serve(@Param('filename') filename: string, @Res() res: Response) {
    if (!SAFE_NAME.test(filename)) throw new NotFoundException();
    const path = join(this.mediaDir, filename);
    try {
      await stat(path);
    } catch {
      throw new NotFoundException();
    }
    const ext = filename.split('.').pop() ?? '';
    res.setHeader(
      'Content-Type',
      CONTENT_TYPES[ext] ?? 'application/octet-stream',
    );
    // Force download for unknown types so the browser never sniffs/renders them.
    if (!CONTENT_TYPES[ext]) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(path);
  }
}
