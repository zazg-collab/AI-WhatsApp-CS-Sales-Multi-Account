import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { currentContext } from './request-context';

const LEVEL_ORDER: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

function enabledLevels(): LogLevel[] {
  // LOG_LEVEL names the *minimum* level to emit (default: log). debug/verbose
  // are off in production unless explicitly requested.
  const min = (process.env.LOG_LEVEL as LogLevel) || 'log';
  const from = LEVEL_ORDER.indexOf(min);
  return LEVEL_ORDER.slice(from < 0 ? LEVEL_ORDER.indexOf('log') : from);
}

/**
 * Emits one JSON object per log line so logs are machine-parseable by Loki /
 * CloudWatch / Datadog instead of the human-formatted Nest default. Every line
 * carries the current request's `requestId` and `userId` (via AsyncLocalStorage),
 * so a service-level error can be tied back to the request that caused it.
 *
 * Falls back to pretty console output when LOG_PRETTY=true (local dev).
 */
export class StructuredLogger extends ConsoleLogger {
  private readonly pretty = process.env.LOG_PRETTY === 'true';

  constructor() {
    super();
    this.setLogLevels(enabledLevels());
  }

  private emit(level: LogLevel, message: unknown, context?: string, stack?: string) {
    if (this.pretty) {
      // Delegate to Nest's colored formatter for readability in dev.
      switch (level) {
        case 'error': return void super.error(message as string, stack as string, context);
        case 'warn': return void super.warn(message as string, context);
        case 'debug': return void super.debug(message as string, context);
        case 'verbose': return void super.verbose(message as string, context);
        default: return void super.log(message as string, context);
      }
    }
    const { requestId, userId } = currentContext();
    const line = {
      ts: new Date().toISOString(),
      level,
      context,
      message:
        typeof message === 'string' ? message : safeStringify(message),
      requestId,
      userId,
      ...(stack ? { stack } : {}),
    };
    const out = JSON.stringify(line);
    if (level === 'error' || level === 'fatal') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  }

  log(message: unknown, context?: string) { this.emit('log', message, context); }
  warn(message: unknown, context?: string) { this.emit('warn', message, context); }
  debug(message: unknown, context?: string) { this.emit('debug', message, context); }
  verbose(message: unknown, context?: string) { this.emit('verbose', message, context); }
  error(message: unknown, stack?: string, context?: string) {
    this.emit('error', message, context, stack);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
