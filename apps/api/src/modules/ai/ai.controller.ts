import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { AiService } from './ai.service';
import { GenerateDto, ConversationRefDto } from './dto/ai-request.dto';

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

  @ApiOperation({ summary: 'Generate AI reply for a conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('generate-reply')
  generateReply(@Body() dto: GenerateDto) {
    return this.ai.generateReply(dto.conversationId, dto.model);
  }

  @ApiOperation({ summary: 'Generate AI draft for a conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('generate-draft')
  generateDraft(@Body() dto: GenerateDto) {
    return this.ai.generateReply(dto.conversationId, dto.model);
  }

  @ApiOperation({ summary: 'Summarize conversation chat history' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('summarize-chat')
  async summarize(@Body() dto: ConversationRefDto) {
    return { summary: await this.ai.summarizeChat(dto.conversationId) };
  }

  @ApiOperation({ summary: 'Score a lead based on conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('lead-score')
  leadScore(@Body() dto: ConversationRefDto) {
    return this.ai.leadScore(dto.conversationId);
  }
}
