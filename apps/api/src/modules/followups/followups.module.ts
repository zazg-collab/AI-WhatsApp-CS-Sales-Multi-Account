import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FollowUpsController } from './followups.controller';
import { FollowUpsService } from './followups.service';
import { FollowUpsProcessor } from './followups.processor';
import { WaModule } from '../wa/wa.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'follow-ups' }),
    forwardRef(() => WaModule),
  ],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpsProcessor],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
