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
        // >>> ANGGA: `aiMode` ikut dikirim supaya kartu bot bisa menampilkan
        // mode akun yang SEBENARNYA berlaku, bukan cuma default botnya. <<<
        accounts: { select: { id: true, accountName: true, phoneNumber: true, sessionStatus: true, aiMode: true } },
      },
    });
  }

  async get(id: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id },
      include: {
        persona: true,
        knowledgeBase: { select: { id: true, name: true, status: true } },
        // >>> ANGGA: `aiMode` ikut dikirim supaya kartu bot bisa menampilkan
        // mode akun yang SEBENARNYA berlaku, bukan cuma default botnya. <<<
        accounts: { select: { id: true, accountName: true, phoneNumber: true, sessionStatus: true, aiMode: true } },
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
        language: dto.language ?? 'en',
        status: dto.status ?? 'draft',
      },
      include: { persona: true, knowledgeBase: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateBotDto) {
    await this.get(id);
    // >>> ANGGA — mengubah "Default AI mode" harus benar-benar berubah.
    //
    // INSIDEN (2026-08-04): kartu bot menampilkan `Default mode: ai_supervised`
    // tepat di atas `WhatsApp accounts: Yanvee`, sementara akun Yanvee yang
    // sesungguhnya masih `ai_draft`. Dua baris yang masing-masing benar, tapi
    // berdampingan membentuk kesimpulan yang salah — dan Bossfren mengambil
    // keputusan operasional berdasarkan kesimpulan itu.
    //
    // Sebabnya: `defaultAiMode` cuma mengalir ke akun saat PENUGASAN berubah
    // (lihat `assignToAccount`). Bossfren membuat bot dengan mode draft,
    // menugaskannya, lalu mengedit modenya jadi supervised — penugasannya tidak
    // berubah, jadi editannya tidak pernah sampai ke mana pun.
    //
    // Sekarang menyimpan bot ikut menerapkannya ke akun yang SEDANG ditugaskan.
    // Ini justru lebih setia pada keterangan yang sudah tertulis di form:
    // "berlaku saat bot ditugaskan ke sebuah nomor" — botnya memang sedang
    // ditugaskan. Kalimat keduanya tetap dipegang: percakapan yang sudah
    // berjalan TIDAK disentuh, modenya diatur per percakapan di Inbox.
    const bot = await this.prisma.bot.update({
      where: { id },
      data: dto,
      include: { persona: true, knowledgeBase: { select: { id: true, name: true } } },
    });
    if (dto.defaultAiMode) {
      await this.prisma.whatsappAccount.updateMany({
        where: { assignedBotId: id },
        data: { aiMode: dto.defaultAiMode },
      });
    }
    return bot;
    // <<< ANGGA
  }

  async delete(id: string) {
    await this.get(id);
    // Detach references first: conversations and accounts FK to bots with NO
    // ACTION, so a plain delete throws if the bot is in use anywhere. Nulling
    // them out cleanly reverts those chats/accounts to "no bot / default".
    // (LearningProposal cascades on its own.)
    return this.prisma.$transaction(async (tx) => {
      await tx.conversation.updateMany({ where: { botId: id }, data: { botId: null } });
      await tx.whatsappAccount.updateMany({
        where: { assignedBotId: id },
        data: { assignedBotId: null },
      });
      return tx.bot.delete({ where: { id } });
    });
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

  async deletePersona(id: string) {
    const p = await this.prisma.persona.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Persona not found');
    // Bot.personaId FK is RESTRICT, so detach any bots using this persona
    // first (they fall back to no persona) before deleting.
    return this.prisma.$transaction(async (tx) => {
      await tx.bot.updateMany({ where: { personaId: id }, data: { personaId: null } });
      return tx.persona.delete({ where: { id } });
    });
  }

  async assignToAccount(botId: string, accountId: string) {
    const bot = await this.get(botId);
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('WhatsApp account not found');

    // >>> ANGGA: `Bot.defaultAiMode` akhirnya dipakai. Sebelumnya kolom itu
    // diisi lewat form, disimpan, lalu tidak pernah dibaca siapa pun — mode
    // akun tetap datang dari SENTINEL_DEFAULT_AI_MODE saat akun dibuat.
    //
    // Dua batas yang SENGAJA dipasang:
    //  1. Hanya saat penugasan benar-benar BERUBAH. Menekan "Tugaskan" ulang
    //     pada akun yang sudah dipegang bot ini tidak menyetel ulang modenya.
    //  2. Hanya menyentuh mode AKUN, tidak pernah percakapan yang sedang jalan
    //     — `conversation.aiMode` distempel saat percakapan lahir dan tetap
    //     apa adanya. Tanpa batas ini, mengedit bot bisa diam-diam menaikkan
    //     puluhan percakapan aktif dari draft ke kirim-otomatis.
    const penugasanBerubah = account.assignedBotId !== botId;
    return this.prisma.whatsappAccount.update({
      where: { id: accountId },
      data: {
        assignedBotId: botId,
        ...(penugasanBerubah ? { aiMode: bot.defaultAiMode } : {}),
      },
    });
    // <<< ANGGA
  }
}
