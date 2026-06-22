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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiExcludeEndpoint } from '@nestjs/swagger';
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

  @ApiOperation({ summary: 'Rebuild semantic embeddings for a knowledge base' })
  @Roles('owner', 'supervisor')
  @Post('knowledge-bases/:id/reindex')
  reindex(@Param('id') id: string) {
    return this.knowledge.reindex(id);
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

  // Integration note: API-only. The knowledge page uses the dry-run parse flow
  // (parse/upload + parse-url) so the user reviews/edits before saving, instead
  // of this blind direct-persist. Kept for programmatic/bulk ingestion.
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Ingest a document (pdf/docx/xlsx/csv/txt/md/html) as knowledge items' })
  @ApiConsumes('multipart/form-data')
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge-bases/:id/items/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  ingestFile(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    return this.knowledge.ingestFile(id, file, user.id);
  }

  // Integration note: API-only. Superseded in the UI by the parse-url dry-run
  // flow (see the items/upload note above). Kept for programmatic ingestion.
  @ApiExcludeEndpoint()
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

  @ApiOperation({ summary: 'Dry-run parse of a file (no persistence) to pre-fill the add-item form' })
  @ApiConsumes('multipart/form-data')
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge/parse/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  parseFile(@UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    return this.knowledge.parseFile(file);
  }

  @ApiOperation({ summary: 'Dry-run parse of a URL (no persistence) to pre-fill the add-item form' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('knowledge/parse-url')
  parseUrl(@Body() dto: IngestUrlDto) {
    return this.knowledge.parseUrl(dto.url);
  }
}
