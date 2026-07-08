import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * Global so any feature service can inject MetricsService to increment counters
 * (ai/hermes/wa) without importing this module everywhere.
 */
@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: 'campaigns' }, { name: 'health' }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
