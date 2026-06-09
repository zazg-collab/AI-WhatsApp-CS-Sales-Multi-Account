import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreatePersonaDto, UpdatePersonaDto } from './dto/create-persona.dto';

@Injectable()
export class BotsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.bot.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        persona: true,
        knowledgeBase: { select: { id: true, name: true } },
        accounts: { select: { id: true, accountName: true, phoneNumber: true, sessionStatus: true } },
      },
    });
  }

  async get(id: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id },
      include: {
        persona: true,
        knowledgeBase: { select: { id: true, name: true, status: true } },
        accounts: { select: { id: true, accountName: true, phoneNumber: true, sessionStatus: true } },
      },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  create(dto: CreateBotDto) {
    return this.prisma.bot.create({
      data: {
        botName: dto.botName,
        personaId: dto.personaId,
        knowledgeBaseId: dto.knowledgeBaseId,
        defaultAiMode: dto.defaultAiMode,
        language: dto.language ?? 'id',
        status: dto.status ?? 'draft',
      },
      include: { persona: true, knowledgeBase: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateBotDto) {
    await this.get(id);
    return this.prisma.bot.update({
      where: { id },
      data: dto,
      include: { persona: true, knowledgeBase: { select: { id: true, name: true } } },
    });
  }

  async delete(id: string) {
    await this.get(id);
    return this.prisma.bot.delete({ where: { id } });
  }

  listPersonas() {
    return this.prisma.persona.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createPersona(dto: CreatePersonaDto) {
    return this.prisma.persona.create({ data: dto });
  }

  async updatePersona(id: string, dto: UpdatePersonaDto) {
    const p = await this.prisma.persona.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Persona not found');
    return this.prisma.persona.update({ where: { id }, data: dto });
  }

  async assignToAccount(botId: string, accountId: string) {
    await this.get(botId);
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('WhatsApp account not found');
    return this.prisma.whatsappAccount.update({
      where: { id: accountId },
      data: { assignedBotId: botId },
    });
  }
}
