import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/api-key.guard';
import { AgentService } from './agent.service';

/**
 * Machine-facing, read-only CRM report API for an external supervisor agent
 * (the Hermes Agent gateway). Authenticated with an API key, NOT a human JWT —
 * and scoped to read-only supervision: no mutations, no message sends, no
 * user/settings access. Excluded from Swagger since it is not a human surface.
 */
@ApiExcludeController()
@UseGuards(ApiKeyGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /** Lets the agent verify its API key before pulling data. */
  @Get('health')
  health() {
    return { status: 'ok', scope: 'supervisor-read-only' };
  }

  /** Consolidated CRM report: summary, performance, leads, follow-ups, gaps. */
  @Get('crm-report')
  crmReport(@Query('days') days?: string) {
    return this.agent.crmReport(Number(days) || 7);
  }
}
