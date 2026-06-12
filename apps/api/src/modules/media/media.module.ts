import { Module } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';

/**
 * Provides the storage abstraction used by both inbound media download
 * (WaService) and admin uploads (ConversationsService). Global-ish via export.
 */
@Module({
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaModule {}
