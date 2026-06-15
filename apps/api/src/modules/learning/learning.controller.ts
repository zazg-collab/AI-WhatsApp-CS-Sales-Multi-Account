import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { LearningService } from './learning.service';
import { EditProposalDto, ListProposalsQueryDto } from './dto/learning.dto';

// AI auto-learning: mine knowledge/persona/memory/playbook from synced history.
@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @ApiOperation({ summary: 'Mine learning proposals for a bot from chat history' })
  @Roles('owner', 'supervisor')
  @Post('bots/:botId/mine')
  mine(@Param('botId') botId: string) {
    return this.learning.mineAll(botId);
  }

  @ApiOperation({ summary: 'List learning proposals (filter by status/type/bot)' })
  @Roles('owner', 'supervisor')
  @Get('proposals')
  list(@Query() query: ListProposalsQueryDto) {
    return this.learning.listProposals(query);
  }

  @ApiOperation({ summary: 'Get a single learning proposal with sources' })
  @Roles('owner', 'supervisor')
  @Get('proposals/:id')
  get(@Param('id') id: string) {
    return this.learning.getProposal(id);
  }

  @ApiOperation({ summary: 'Edit a pending proposal before approving' })
  @Roles('owner')
  @Post('proposals/:id/edit')
  edit(@Param('id') id: string, @Body() dto: EditProposalDto) {
    return this.learning.editProposal(id, dto.payload, dto.title);
  }

  @ApiOperation({ summary: 'Approve a proposal → materialize into live data' })
  @Roles('owner')
  @Post('proposals/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.learning.approve(id, user.id);
  }

  @ApiOperation({ summary: 'Reject a proposal' })
  @Roles('owner')
  @Post('proposals/:id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.learning.reject(id, user.id);
  }
}
