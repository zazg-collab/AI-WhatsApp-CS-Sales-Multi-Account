import { describe, it, expect, vi } from 'vitest';

// /dashboard redirects to /inbox via next/navigation redirect().
// We just verify the module resolves without errors (the redirect call
// itself is a no-op in the test environment).
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

describe('DashboardPage redirect', () => {
  it('module resolves', async () => {
    const mod = await import('./page');
    expect(mod.default).toBeDefined();
  });
});
