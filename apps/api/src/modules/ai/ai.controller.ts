import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotImplemented } from '../../common/not-implemented';

// PRD 14.4 — AI engine (Claude). Prompt assembly per PRD section 15.1.
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  @Post('generate-reply')
  generateReply() {
    return NotImplemented('ai.generateReply');
  }

  @Post('generate-draft')
  generateDraft() {
    return NotImplemented('ai.generateDraft');
  }

  @Post('summarize-chat')
  summarize() {
    return NotImplemented('ai.summarizeChat');
  }

  @Post('lead-score')
  leadScore() {
    return NotImplemented('ai.leadScore');
  }
}
