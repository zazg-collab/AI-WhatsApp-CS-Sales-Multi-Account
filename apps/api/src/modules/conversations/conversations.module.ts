import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationMessagesController } from './conversation-messages.controller';
import { ConversationChatOpsController } from './conversation-chat-ops.controller';
import { ConversationsService } from './conversations.service';
import { WaModule } from '../wa/wa.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [WaModule, MediaModule],
  controllers: [
    ConversationsController,
    ConversationMessagesController,
    ConversationChatOpsController,
  ],
  providers: [ConversationsService],
})
export class ConversationsModule {}
