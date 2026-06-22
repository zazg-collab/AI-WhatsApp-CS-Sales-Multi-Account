import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { AssetsService } from './assets.service';
import {
  CreateAssetDto,
  ListAssetsQueryDto,
  SendAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';

// Only file types the chat surface can actually render/send are accepted on
// upload. The stored MIME is otherwise attacker-controlled (it comes from the
// multipart header), so without this an .html/.svg/.exe could be stored and
// later served — reject anything outside the allowlist up front.
const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/3gpp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'application/pdf',
]);

// Curated media library: brochures, product cards, testimonials.
@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @ApiOperation({ summary: 'List media assets (filter by purpose/status)' })
  @Roles('viewer')
  @Get()
  list(@Query() query: ListAssetsQueryDto) {
    return this.assets.list(query);
  }

  @ApiOperation({ summary: 'Suggest assets to send for a conversation (advisory)' })
  @Roles('admin', 'supervisor', 'owner')
  @Get('suggestions')
  suggestions(@Query('conversationId') conversationId: string) {
    return this.assets.suggest(conversationId);
  }

  @ApiOperation({ summary: 'Upload a new media asset (image/video/document)' })
  @ApiConsumes('multipart/form-data')
  @Roles('admin', 'supervisor', 'owner')
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Number(process.env.WA_MEDIA_MAX_BYTES) || 25 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string } | undefined,
    @Body() dto: CreateAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    const mime = (file.mimetype ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_UPLOAD_MIME.has(mime)) {
      throw new BadRequestException(`Unsupported file type: ${mime || 'unknown'}`);
    }
    return this.assets.create(dto, file, user.id);
  }

  @ApiOperation({ summary: 'Update asset metadata' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete an asset' })
  @Roles('supervisor', 'owner')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assets.remove(id, user.id);
  }

  @ApiOperation({ summary: 'Send an asset into a conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/send')
  send(@Param('id') id: string, @Body() dto: SendAssetDto, @CurrentUser() user: AuthUser) {
    return this.assets.sendToConversation(id, dto.conversationId, user.id);
  }
}
