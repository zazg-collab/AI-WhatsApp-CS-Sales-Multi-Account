import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeItemDto,
  IngestUrlDto,
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

  @ApiOperation({ summary: 'Ingest a document (pdf/docx/xlsx/csv/txt/md/html) as knowledge items' })
  @ApiConsumes('multipart/form-data')
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases/:id/items/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  ingestFile(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    return this.knowledge.ingestFile(id, file, user.id);
  }

  @ApiOperation({ summary: 'Ingest a public web page as knowledge items' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases/:id/items/from-url')
  ingestUrl(
    @Param('id') id: string,
    @Body() dto: IngestUrlDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledge.ingestUrl(id, dto.url, user.id);
  }
}
