import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { SettingsService } from '../modules/settings/settings.service';

/**
 * Outbound alert channel — delegated to the Hermes Agent messaging gateway
 * (NousResearch/hermes-agent) via its `hermes send --to <platform>` CLI.
 *
 * Why the gateway instead of a per-platform integration: `hermes send` already
 * supports Telegram, Discord, Slack, WhatsApp, Signal, SMS, Matrix, etc., and
 * calls each platform's REST endpoint directly (no running gateway process
 * required). Per-platform credentials live in the Hermes Agent config, not in
 * this app — so adding a channel is a Hermes config change, not a code change.
 *
 * Config:
 *   HERMES_NOTIFY_TARGET  e.g. "telegram", "slack:#alerts", "whatsapp"
 *   HERMES_BIN            path to the hermes CLI (default: "hermes")
 *
 * Fire-and-forget: never throws into the caller, and no-ops when the target
 * is unset or the CLI is unavailable.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly envTarget: string;
  private readonly bin: string;

  constructor(
    config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    this.envTarget = config.get<string>('HERMES_NOTIFY_TARGET') ?? '';
    this.bin = config.get<string>('HERMES_BIN') ?? 'hermes';
  }

  /** Cheap env-based hint (e.g. health check). The live target used for sending
   *  is resolved from settings in send(). */
  get enabled(): boolean {
    return Boolean(this.envTarget);
  }

  async send(text: string): Promise<void> {
    // Authoritative, runtime-editable target (falls back to env via settings).
    const { hermesNotifyTarget: target } = await this.settings.notifications();
    if (!target) return;
    await new Promise<void>((resolve) => {
      let stderr = '';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const child = spawn(this.bin, ['send', '--to', target], {
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      // Timeout guard (H8): never let a hung CLI block the caller indefinitely.
      const timer = setTimeout(() => {
        this.logger.warn('hermes send timed out, killing child process');
        child.kill('SIGKILL');
        finish();
      }, 10_000);
      child.stderr?.on('data', (d) => (stderr += d));
      child.on('error', (err) => {
        this.logger.error(`hermes send unavailable: ${err.message}`);
        finish();
      });
      child.on('close', (code) => {
        if (code !== 0) {
          this.logger.warn(`hermes send exited ${code}: ${stderr.trim()}`);
        }
        finish();
      });
      child.stdin?.end(text);
    });
  }
}
