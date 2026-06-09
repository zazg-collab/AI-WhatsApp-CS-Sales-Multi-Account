import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiProviderService, PromptBuilderService],
  exports: [AiService, AiProviderService, PromptBuilderService],
})
export class AiModule {}
