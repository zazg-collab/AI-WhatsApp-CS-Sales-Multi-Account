import { Module } from '@nestjs/common';
import { HermesController } from './hermes.controller';

@Module({ controllers: [HermesController] })
export class HermesModule {}
