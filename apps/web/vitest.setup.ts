import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

// --- next/navigation mock ---
export const pushMock = vi.fn();
export const replaceMock = vi.fn();
let pathname = '/dashboard';

export function setPathname(p: string) {
  pathname = p;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

// --- next/link mock (render plain anchor) ---
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    require('react').createElement('a', { href, ...rest }, children),
}));

// --- localStorage mock ---
class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return key in this.store ? this.store[key] : null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

Object.defineProperty(window, 'localStorage', {
  value: new LocalStorageMock(),
  writable: true,
});

// sessionStorage (used by hermes chat history) — mock for consistency + clearing.
Object.defineProperty(window, 'sessionStorage', {
  value: new LocalStorageMock(),
  writable: true,
});

// jsdom does not implement scrollIntoView; several views call it in effects.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Default global fetch mock. The shared <Sidebar> probes `${API_URL}/health`
// with real fetch on mount; under jsdom that hits the network and rejects
// AFTER the test unmounts, surfacing as an "unhandled error". Returning a
// controlled non-ok response keeps that probe inert. Tests that exercise fetch
// directly (e.g. downloadFile) override global.fetch themselves.
const defaultFetch = () =>
  Promise.resolve({
    ok: false,
    status: 503,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
  } as unknown as Response);

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  window.localStorage.clear();
  pathname = '/dashboard';
  global.fetch = vi.fn(defaultFetch) as unknown as typeof fetch;
});
