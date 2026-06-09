import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotImplemented } from '../../common/not-implemented';

// PRD 14.6 — Knowledge base.
@UseGuards(JwtAuthGuard)
@Controller()
export class KnowledgeController {
  @Get('knowledge-bases')
  list() {
    return NotImplemented('knowledge.list');
  }

  @Post('knowledge-bases')
  create() {
    return NotImplemented('knowledge.create');
  }

  @Get('knowledge-bases/:id')
  get(@Param('id') _id: string) {
    return NotImplemented('knowledge.get');
  }

  @Patch('knowledge-bases/:id')
  update(@Param('id') _id: string) {
    return NotImplemented('knowledge.update');
  }

  @Post('knowledge-bases/:id/items')
  addItem(@Param('id') _id: string) {
    return NotImplemented('knowledge.addItem');
  }

  @Patch('knowledge-items/:id')
  updateItem(@Param('id') _id: string) {
    return NotImplemented('knowledge.updateItem');
  }
}
