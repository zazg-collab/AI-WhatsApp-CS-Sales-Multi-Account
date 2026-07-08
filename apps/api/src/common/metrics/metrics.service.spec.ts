import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders Prometheus exposition text with core series', async () => {
    const m = new MetricsService();
    m.httpTotal.inc({ method: 'GET', route: 'Health#check', status: '200' });
    m.httpDuration.observe({ method: 'GET', route: 'Health#check', status: '200' }, 0.12);
    m.aiRequests.inc({ outcome: 'success' });
    m.sentinelReviews.inc({ decision: 'approve' });
    m.waEvents.inc({ event: 'connected' });

    const out = await m.render();
    expect(out).toContain('http_requests_total');
    expect(out).toContain('http_request_duration_seconds');
    expect(out).toContain('ai_requests_total');
    expect(out).toContain('sentinel_reviews_total');
    expect(out).toContain('wa_events_total');
    // default process metrics are namespaced
    expect(out).toContain('hermes_process_cpu_seconds_total');
  });
});
