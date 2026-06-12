import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WaModule } from '../wa/wa.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuditModule, WaModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
