import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { AiCacheService } from './ai-cache.service';
import { EmbeddingService } from './embedding.service';
import { KnowledgeIndexService } from './knowledge-index.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiProviderService,
    PromptBuilderService,
    AiCacheService,
    EmbeddingService,
    KnowledgeIndexService,
  ],
  exports: [
    AiService,
    AiProviderService,
    PromptBuilderService,
    AiCacheService,
    EmbeddingService,
    KnowledgeIndexService,
  ],
})
export class AiModule {}
