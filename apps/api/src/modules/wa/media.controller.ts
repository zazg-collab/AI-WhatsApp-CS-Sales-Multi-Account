import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { MediaStorageService, contentTypeForExt } from '../media/media-storage.service';

// Only files the gateway/upload path wrote: <uuid v4>.<short ext>. Anything
// else — path traversal, dotfiles, session files — can never match.
const SAFE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

/**
 * Streams chat media (inbound downloads + admin uploads) regardless of the
 * configured storage driver — MediaStorageService.read() resolves local disk
 * or proxies a private S3/Supabase object.
 *
 * Intentionally unauthenticated: <img>/<audio>/<video> tags cannot attach a
 * JWT header. Access control is the capability URL — filenames are random
 * server-generated UUIDs, never enumerable, shared only inside the
 * authenticated chat payload.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly storage: MediaStorageService) {}

  @ApiOperation({ summary: 'Serve a stored media file' })
  @Get(':filename')
  async serve(@Param('filename') filename: string, @Res() res: Response) {
    if (!SAFE_NAME.test(filename)) throw new NotFoundException();
    const buffer = await this.storage.read(filename);
    const ext = filename.split('.').pop() ?? '';
    const contentType = contentTypeForExt(ext);
    res.setHeader('Content-Type', contentType);
    // Force download for unknown types so the browser never sniffs/renders them.
    if (contentType === 'application/octet-stream') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  }
}
