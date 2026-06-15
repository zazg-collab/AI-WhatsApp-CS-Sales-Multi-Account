import { Module } from '@nestjs/common';
import { WaModule } from '../wa/wa.module';
import { MediaModule } from '../media/media.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [WaModule, MediaModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
