import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { AiCacheService } from './ai-cache.service';
import { EmbeddingService } from './embedding.service';
import { KnowledgeIndexService } from './knowledge-index.service';
import { ProductsModule } from '../products/products.module';
// >>> ANGGA: provider modul shipping didaftarkan di sini (bukan di
// ShippingModule) supaya PromptBuilderService <-> ShippingService <->
// AiProviderService tidak perlu saling impor modul (forwardRef).
import { ShippingService } from '../shipping/shipping.service';
import { MengantarClient } from '../shipping/mengantar.client';
import { ShippingQuoteCache } from '../shipping/shipping-quote.cache';
// <<< ANGGA
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [ProductsModule, WebhooksModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiProviderService,
    PromptBuilderService,
    AiCacheService,
    EmbeddingService,
    KnowledgeIndexService,
    // >>> ANGGA
    MengantarClient,
    ShippingQuoteCache,
    ShippingService,
    // <<< ANGGA
  ],
  exports: [
    AiService,
    AiProviderService,
    PromptBuilderService,
    AiCacheService,
    EmbeddingService,
    KnowledgeIndexService,
    ShippingService, // >>> ANGGA <<<
  ],
})
export class AiModule {}
