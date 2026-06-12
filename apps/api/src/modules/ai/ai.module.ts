import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { AiCacheService } from './ai-cache.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiProviderService, PromptBuilderService, AiCacheService],
  exports: [AiService, AiProviderService, PromptBuilderService, AiCacheService],
})
export class AiModule {}
