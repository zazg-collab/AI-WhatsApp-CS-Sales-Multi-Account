import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto';

// PRD 14.6 — Knowledge base.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('knowledge-bases')
  list() {
    return this.knowledge.listBases();
  }

  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases')
  create(@Body() dto: CreateKnowledgeBaseDto, @CurrentUser() user: AuthUser) {
    return this.knowledge.createBase(dto, user.id);
  }

  @Get('knowledge-bases/:id')
  get(@Param('id') id: string) {
    return this.knowledge.getBase(id);
  }

  @Roles('owner', 'supervisor')
  @Patch('knowledge-bases/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledge.updateBase(id, dto, user.id);
  }

  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases/:id/items')
  addItem(@Param('id') id: string, @Body() dto: CreateKnowledgeItemDto) {
    return this.knowledge.addItem(id, dto);
  }

  @Roles('owner', 'supervisor', 'admin')
  @Patch('knowledge-items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateKnowledgeItemDto) {
    return this.knowledge.updateItem(id, dto);
  }
}
