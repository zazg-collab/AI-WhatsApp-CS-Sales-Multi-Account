import { Module } from '@nestjs/common';
import { WaController } from './wa.controller';

@Module({ controllers: [WaController] })
export class WaModule {}
