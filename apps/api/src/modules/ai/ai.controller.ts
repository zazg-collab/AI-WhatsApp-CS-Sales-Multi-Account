import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { AiService } from './ai.service';
import { ConversationRefDto } from './dto/ai-request.dto';

// PRD 14.4 — AI engine. Provider is OpenAI-compatible and selected via env.
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @ApiOperation({ summary: 'Get AI provider config (base URL + default model)' })
  @Roles('viewer')
  @Get('config')
  config() {
    return this.ai.config();
  }

  @ApiOperation({ summary: 'List models from AI provider' })
  @Roles('viewer')
  @Get('models')
  models() {
    return this.ai.listModels();
  }

  @ApiOperation({ summary: 'Summarize conversation chat history' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('summarize-chat')
  async summarize(@Body() dto: ConversationRefDto, @CurrentUser() user: AuthUser) {
    return { summary: await this.ai.summarizeChat(dto.conversationId, user) };
  }

  @ApiOperation({ summary: 'Score a lead based on conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('lead-score')
  leadScore(@Body() dto: ConversationRefDto, @CurrentUser() user: AuthUser) {
    return this.ai.leadScore(dto.conversationId, user);
  }

  // Integration note: API-only. Sentiment is computed inline during reply
  // generation; this standalone endpoint has no frontend caller yet.
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Analyze customer sentiment for a conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('sentiment')
  sentiment(@Body() dto: ConversationRefDto, @CurrentUser() user: AuthUser) {
    return this.ai.analyzeSentiment(dto.conversationId, user);
  }

  // Integration note: API-only diagnostics — not surfaced in the UI yet.
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'AI response cache stats (owner/supervisor)' })
  @Roles('owner', 'supervisor')
  @Get('cache/stats')
  cacheStats() {
    return this.ai.cacheStats();
  }
}
