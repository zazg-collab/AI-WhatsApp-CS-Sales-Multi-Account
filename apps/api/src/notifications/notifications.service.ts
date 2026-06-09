import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Outbound alert channel. Currently Telegram (PRD 17.3 / 18); the interface
 * is channel-agnostic so WhatsApp-group / email can be added later.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly token: string;
  private readonly chatId: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
    this.chatId = config.get<string>('TELEGRAM_ALERT_CHAT_ID') ?? '';
  }

  get enabled(): boolean {
    return Boolean(this.token && this.chatId);
  }

  /** Fire-and-forget alert; never throws into the caller's flow. */
  async send(text: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
        }),
      });
    } catch (err) {
      this.logger.error(`Telegram notify failed: ${err}`);
    }
  }
}
