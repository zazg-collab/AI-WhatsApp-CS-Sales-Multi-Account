import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateDto, ConversationRefDto } from './dto/ai-request.dto';

// PRD 14.4 — AI engine. Provider is OpenAI-compatible and selected via env.
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Configured provider base URL + default model (no secrets). */
  @Get('config')
  config() {
    return this.ai.config();
  }

  /** Models advertised by the configured AI_BASE_URL. */
  @Get('models')
  models() {
    return this.ai.listModels();
  }

  @Post('generate-reply')
  generateReply(@Body() dto: GenerateDto) {
    return this.ai.generateReply(dto.conversationId, dto.model);
  }

  @Post('generate-draft')
  generateDraft(@Body() dto: GenerateDto) {
    return this.ai.generateReply(dto.conversationId, dto.model);
  }

  @Post('summarize-chat')
  async summarize(@Body() dto: ConversationRefDto) {
    return { summary: await this.ai.summarizeChat(dto.conversationId) };
  }

  @Post('lead-score')
  leadScore(@Body() dto: ConversationRefDto) {
    return this.ai.leadScore(dto.conversationId);
  }
}
