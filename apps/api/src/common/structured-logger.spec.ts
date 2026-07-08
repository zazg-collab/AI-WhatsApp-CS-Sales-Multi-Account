import { StructuredLogger } from './structured-logger';
import { requestContext } from './request-context';

describe('StructuredLogger', () => {
  const orig = process.stdout.write.bind(process.stdout);
  let lines: string[];

  beforeEach(() => {
    lines = [];
    (process.stdout.write as unknown) = (chunk: string) => {
      lines.push(chunk);
      return true;
    };
  });
  afterEach(() => {
    (process.stdout.write as unknown) = orig;
  });

  it('emits one JSON line per log with level/context/message', () => {
    const logger = new StructuredLogger();
    logger.log('hello', 'TestCtx');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ level: 'log', context: 'TestCtx', message: 'hello' });
    expect(typeof parsed.ts).toBe('string');
  });

  it('includes the ambient requestId/userId from AsyncLocalStorage', () => {
    const logger = new StructuredLogger();
    requestContext.run({ requestId: 'req-123', userId: 'u-9' }, () => {
      logger.log('scoped');
    });
    const parsed = JSON.parse(lines[0]);
    expect(parsed.requestId).toBe('req-123');
    expect(parsed.userId).toBe('u-9');
  });
});
