import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
@ApiTags('knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @ApiOperation({ summary: 'List all knowledge bases' })
  @Roles('viewer')
  @Get('knowledge-bases')
  list() {
    return this.knowledge.listBases();
  }

  @ApiOperation({ summary: 'Create a knowledge base' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases')
  create(@Body() dto: CreateKnowledgeBaseDto, @CurrentUser() user: AuthUser) {
    return this.knowledge.createBase(dto, user.id);
  }

  @ApiOperation({ summary: 'Get a knowledge base by ID' })
  @Roles('viewer')
  @Get('knowledge-bases/:id')
  get(@Param('id') id: string) {
    return this.knowledge.getBase(id);
  }

  @ApiOperation({ summary: 'Update a knowledge base' })
  @Roles('owner', 'supervisor')
  @Patch('knowledge-bases/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledge.updateBase(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Add an item to a knowledge base' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases/:id/items')
  addItem(@Param('id') id: string, @Body() dto: CreateKnowledgeItemDto) {
    return this.knowledge.addItem(id, dto);
  }

  @ApiOperation({ summary: 'Update a knowledge item' })
  @Roles('owner', 'supervisor', 'admin')
  @Patch('knowledge-items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateKnowledgeItemDto) {
    return this.knowledge.updateItem(id, dto);
  }
}
