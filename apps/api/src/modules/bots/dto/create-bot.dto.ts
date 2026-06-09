import { AiMode, BotStatus } from '@hermes/database';

export class CreateBotDto {
  botName!: string;
  personaId?: string;
  knowledgeBaseId?: string;
  defaultAiMode?: AiMode;
  language?: string;
  status?: BotStatus;
}
