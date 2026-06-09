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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BotsService } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreatePersonaDto, UpdatePersonaDto } from './dto/create-persona.dto';

@UseGuards(JwtAuthGuard)
@Controller('bots')
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Get()
  list() {
    return this.bots.list();
  }

  @Post()
  create(@Body() dto: CreateBotDto) {
    return this.bots.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.bots.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.bots.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.bots.delete(id);
  }

  @Post(':id/assign/:accountId')
  assignToAccount(
    @Param('id') botId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.bots.assignToAccount(botId, accountId);
  }

  @Get('personas/list')
  listPersonas() {
    return this.bots.listPersonas();
  }

  @Post('personas')
  createPersona(@Body() dto: CreatePersonaDto) {
    return this.bots.createPersona(dto);
  }

  @Patch('personas/:id')
  updatePersona(@Param('id') id: string, @Body() dto: UpdatePersonaDto) {
    return this.bots.updatePersona(id, dto);
  }
}
