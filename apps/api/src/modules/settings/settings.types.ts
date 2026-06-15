/** Runtime-editable settings, grouped by category. Each category is stored as
 *  one row in app_settings (key = category name, value = the object below). */
export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface WaSettings {
  /** Random per-message send delay bounds (anti-ban). */
  humanDelayMinMs: number;
  humanDelayMaxMs: number;
  /** Typing-indicator duration model: perChar, clamped to [min, max]. */
  typingPerCharMs: number;
  typingMinMs: number;
  typingMaxMs: number;
}

export interface NotificationSettings {
  /** Hermes Agent target, e.g. "telegram" or "slack:#alerts". Empty = off. */
  hermesNotifyTarget: string;
}

export interface SlaSettings {
  /** Minutes an inbound customer message may go unanswered before SLA breach. */
  responseMinutes: number;
}

export interface AppSettings {
  ai: AiSettings;
  wa: WaSettings;
  notifications: NotificationSettings;
  sla: SlaSettings;
}

export type SettingsCategory = keyof AppSettings;
