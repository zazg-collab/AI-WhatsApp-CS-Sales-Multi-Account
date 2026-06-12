import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { WaModule } from '../wa/wa.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [WaModule, MediaModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
