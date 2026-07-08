import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAccountDto } from './update-account.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateAccountDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('UpdateAccountDto business hours validation', () => {
  it('accepts a valid HH:MM time', async () => {
    expect(await errorsFor({ businessHoursStart: '09:00' })).toHaveLength(0);
  });

  it('treats an empty-string time as "not provided" (cleared input)', async () => {
    expect(await errorsFor({ businessHoursStart: '', businessHoursEnd: '' })).toHaveLength(0);
  });

  it('still rejects a malformed time', async () => {
    const errors = await errorsFor({ businessHoursStart: '25:99' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('businessHoursStart');
  });

  it('rejects unknown properties (whitelist)', async () => {
    const errors = await errorsFor({ hacker: 'rm -rf' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
