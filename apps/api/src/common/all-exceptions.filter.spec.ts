import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@sentinel/database';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost() {
  const response: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    getHeader: jest.fn(),
  };
  const request: any = { method: 'PATCH', url: '/api/v1/x', requestId: 'r1' };
  const host: any = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  };
  return { host, response };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
  } as never);
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('maps P2003 (broken FK reference) to 400 instead of 500 (A11)', () => {
    const { host, response } = makeHost();
    filter.catch(prismaError('P2003'), host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json.mock.calls[0][0].message).toMatch(/does not exist/i);
  });

  it('maps P2002 (unique violation) to 409', () => {
    const { host, response } = makeHost();
    filter.catch(prismaError('P2002'), host);
    expect(response.status).toHaveBeenCalledWith(409);
  });

  it('maps P2025 (record not found) to 404', () => {
    const { host, response } = makeHost();
    filter.catch(prismaError('P2025'), host);
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('leaves unknown Prisma codes as 500', () => {
    const { host, response } = makeHost();
    filter.catch(prismaError('P9999'), host);
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('passes HttpExceptions through unchanged', () => {
    const { host, response } = makeHost();
    filter.catch(new BadRequestException('nope'), host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json.mock.calls[0][0].message).toBe('nope');
  });
});
