import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ApiKeyGuard } from '../../common/api-key.guard';
import { DashboardModule } from '../dashboard/dashboard.module';
import { HermesModule } from '../hermes/hermes.module';

/**
 * External supervisor-agent API: read-only CRM reports for the Hermes Agent
 * gateway, authenticated by API key (see ApiKeyGuard).
 */
@Module({
  imports: [DashboardModule, HermesModule],
  controllers: [AgentController],
  providers: [AgentService, ApiKeyGuard],
})
export class AgentModule {}
