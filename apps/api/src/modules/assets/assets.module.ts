import { Module } from '@nestjs/common';
import { WaModule } from '../wa/wa.module';
import { MediaModule } from '../media/media.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [WaModule, MediaModule],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    // String-token alias so WaService can resolve auto-send via ModuleRef
    // without importing the class (which would create a circular reference).
    { provide: 'ASSETS_SERVICE', useExisting: AssetsService },
  ],
  exports: [AssetsService, 'ASSETS_SERVICE'],
})
export class AssetsModule {}
