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

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  window.localStorage.clear();
  pathname = '/dashboard';
});
