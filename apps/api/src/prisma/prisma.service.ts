import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@sentinel/database';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // ponytail: temporary boot-timing diagnostic for the H20 boot-timeout
    // investigation — remove once the slow stage is confirmed.
    this.logger.log('Connecting to Postgres...');
    const start = Date.now();
    await this.$connect();
    this.logger.log(`Postgres connected in ${Date.now() - start}ms`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
