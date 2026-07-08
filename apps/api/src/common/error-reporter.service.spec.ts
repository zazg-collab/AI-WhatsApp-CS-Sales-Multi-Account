import { ErrorReporterService } from './error-reporter.service';

describe('ErrorReporterService', () => {
  const originalFetch = global.fetch;
  const originalWebhook = process.env.ERROR_WEBHOOK_URL;

  beforeEach(() => {
    process.env.ERROR_WEBHOOK_URL = 'https://example.test/hook';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ERROR_WEBHOOK_URL = originalWebhook;
    jest.restoreAllMocks();
  });

  it('posts to the webhook on first occurrence', () => {
    const fetchMock = jest.fn().mockResolvedValue({});
    global.fetch = fetchMock as any;
    const service = new ErrorReporterService();

    service.capture(new Error('boom'), { route: 'X#y' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('suppresses repeated identical errors within the dedup window', () => {
    const fetchMock = jest.fn().mockResolvedValue({});
    global.fetch = fetchMock as any;
    const service = new ErrorReporterService();

    service.capture(new Error('boom'), { route: 'X#y' });
    service.capture(new Error('boom'), { route: 'X#y' });
    service.capture(new Error('boom'), { route: 'X#y' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not suppress errors with a different fingerprint', () => {
    const fetchMock = jest.fn().mockResolvedValue({});
    global.fetch = fetchMock as any;
    const service = new ErrorReporterService();

    service.capture(new Error('boom'), { route: 'X#y' });
    service.capture(new Error('different error'), { route: 'X#y' });
    service.capture(new Error('boom'), { route: 'Z#w' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never throws even when fetch rejects', () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    const service = new ErrorReporterService();

    expect(() => service.capture(new Error('boom'))).not.toThrow();
  });

  it('no-ops the webhook when ERROR_WEBHOOK_URL is unset', () => {
    process.env.ERROR_WEBHOOK_URL = '';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const service = new ErrorReporterService();

    service.capture(new Error('boom'));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
