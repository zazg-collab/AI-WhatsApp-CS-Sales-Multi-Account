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
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ProductsService } from './products.service';

class UpdateProductDto {
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() description?: string;
}

class CreateSourceDto {
  @IsIn(['gsheet_csv', 'postgres']) type!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() connectionString?: string;
  @IsOptional() @IsString() query?: string;
}

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'List products (filter by search/status)' })
  @Roles('viewer')
  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string) {
    return this.products.list({ search, status });
  }

  @ApiOperation({ summary: 'Update a product (stock/price/status/description)' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @ApiOperation({ summary: 'Sync products from an uploaded CSV' })
  @ApiConsumes('multipart/form-data')
  @Roles('admin', 'supervisor', 'owner')
  @Post('sync/csv')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  syncCsv(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    return this.products.syncFromCsv(file.buffer, user.id);
  }

  // ── Sources ──
  @ApiOperation({ summary: 'List product data sources' })
  @Roles('admin', 'supervisor', 'owner')
  @Get('sources/list')
  listSources() {
    return this.products.listSources();
  }

  @ApiOperation({ summary: 'Add a product source (published Google Sheet CSV URL)' })
  @Roles('supervisor', 'owner')
  @Post('sources')
  createSource(@Body() dto: CreateSourceDto) {
    return this.products.createSource(dto);
  }

  @ApiOperation({ summary: 'Re-sync a product source now' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('sources/:id/sync')
  syncSource(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.products.syncSource(id, user.id);
  }

  @ApiOperation({ summary: 'Delete a product source' })
  @Roles('supervisor', 'owner')
  @Delete('sources/:id')
  deleteSource(@Param('id') id: string) {
    return this.products.deleteSource(id);
  }
}
