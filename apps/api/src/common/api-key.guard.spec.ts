import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function ctx(headers: Record<string, string | undefined>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as any;
}

function guardWith(key: string) {
  return new ApiKeyGuard({ get: () => key } as any);
}

describe('ApiKeyGuard', () => {
  it('fails closed when AGENT_API_KEY is not configured', () => {
    expect(() => guardWith('').canActivate(ctx({ 'x-api-key': 'anything' }))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects a missing key', () => {
    expect(() => guardWith('secret').canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong key', () => {
    expect(() => guardWith('secret').canActivate(ctx({ 'x-api-key': 'nope' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the matching key via x-api-key', () => {
    expect(guardWith('secret').canActivate(ctx({ 'x-api-key': 'secret' }))).toBe(true);
  });

  it('accepts the matching key via Authorization: Bearer', () => {
    expect(
      guardWith('secret').canActivate(ctx({ authorization: 'Bearer secret' })),
    ).toBe(true);
  });
});
