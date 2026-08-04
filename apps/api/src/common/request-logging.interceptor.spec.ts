import { of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

/**
 * >>> ANGGA — self-poll tidak usah membanjiri log.
 *
 * Sidebar dashboard memanggil /health tiap 30 detik dan Prometheus menarik
 * /metrics dengan jadwalnya sendiri. Barisnya menenggelamkan permintaan yang
 * benar-benar dilakukan orang. Yang dibungkam HANYA barisnya, dan HANYA saat
 * responsnya sehat — metrik tetap jalan, dan self-poll yang gagal tetap
 * dicatat karena justru itu sinyal yang paling dicari saat ada masalah.
 */
function ctx(controller: string, handler: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/api/v1/x', originalUrl: '/api/v1/x', ip: '::1' }),
      getResponse: () => ({ statusCode: status, getHeader: () => 'req-1' }),
    }),
    getClass: () => ({ name: controller }),
    getHandler: () => ({ name: handler }),
  } as never;
}

let status = 200;

describe('ANGGA — RequestLoggingInterceptor menyaring self-poll', () => {
  let logged: string[];
  let metrics: { httpDuration: { observe: jest.Mock }; httpTotal: { inc: jest.Mock } };
  let interceptor: RequestLoggingInterceptor;

  beforeEach(() => {
    status = 200;
    logged = [];
    metrics = {
      httpDuration: { observe: jest.fn() },
      httpTotal: { inc: jest.fn() },
    };
    interceptor = new RequestLoggingInterceptor(metrics as never);
    jest
      .spyOn((interceptor as unknown as { logger: { log: (m: string) => void } }).logger, 'log')
      .mockImplementation((m: string) => { logged.push(m); });
  });

  const run = async (controller: string, handler: string, fail = false) => {
    const handle = { handle: () => (fail ? throwError(() => new Error('x')) : of('ok')) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx(controller, handler), handle as never).subscribe({
        next: () => resolve(),
        error: () => resolve(),
      });
    });
  };

  it('permintaan biasa tetap dicatat', async () => {
    await run('ConversationsController', 'list');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('ConversationsController#list');
  });

  it('/health yang sehat TIDAK dicatat', async () => {
    await run('HealthController', 'check');
    expect(logged).toHaveLength(0);
  });

  it('/metrics yang sehat TIDAK dicatat', async () => {
    await run('MetricsController', 'scrape');
    expect(logged).toHaveLength(0);
  });

  it('metrik Prometheus TETAP dicatat untuk self-poll (bukan titik buta)', async () => {
    await run('HealthController', 'check');
    expect(metrics.httpTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'HealthController#check', status: '200' }),
    );
    expect(metrics.httpDuration.observe).toHaveBeenCalled();
  });

  it('/health yang GAGAL tetap dicatat — ini justru sinyal terpenting', async () => {
    status = 503;
    await run('HealthController', 'check');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('HealthController#check');
    expect(logged[0]).toContain('503');
  });

  it('endpoint /health lain (ready/whatsapp) tidak ikut dibungkam', async () => {
    await run('HealthController', 'ready');
    await run('HealthController', 'whatsapp');
    expect(logged).toHaveLength(2);
  });
});
