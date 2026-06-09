import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BotsService } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreatePersonaDto, UpdatePersonaDto } from './dto/create-persona.dto';

@ApiTags('bots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bots')
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @ApiOperation({ summary: 'List all bots' })
  @Get()
  list() {
    return this.bots.list();
  }

  @ApiOperation({ summary: 'Create a new bot' })
  @Post()
  create(@Body() dto: CreateBotDto) {
    return this.bots.create(dto);
  }

  @ApiOperation({ summary: 'Get a bot by ID' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.bots.get(id);
  }

  @ApiOperation({ summary: 'Update a bot' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.bots.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete a bot' })
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.bots.delete(id);
  }

  @ApiOperation({ summary: 'Assign a bot to a WhatsApp account' })
  @Post(':id/assign/:accountId')
  assignToAccount(
    @Param('id') botId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.bots.assignToAccount(botId, accountId);
  }

  @ApiOperation({ summary: 'List all personas' })
  @Get('personas/list')
  listPersonas() {
    return this.bots.listPersonas();
  }

  @ApiOperation({ summary: 'Create a new persona' })
  @Post('personas')
  createPersona(@Body() dto: CreatePersonaDto) {
    return this.bots.createPersona(dto);
  }

  @ApiOperation({ summary: 'Update a persona' })
  @Patch('personas/:id')
  updatePersona(@Param('id') id: string, @Body() dto: UpdatePersonaDto) {
    return this.bots.updatePersona(id, dto);
  }
}
