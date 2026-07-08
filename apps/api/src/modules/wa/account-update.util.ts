import { Prisma } from '@sentinel/database';
import { UpdateAccountDto } from './dto/update-account.dto';

/**
 * Map an UpdateAccountDto into an explicit Prisma update payload. Only known,
 * client-editable columns are forwarded — the persisted field set is this
 * allowlist, NOT whatever happens to be on the DTO — so a stray property can
 * never reach the database. Undefined fields are dropped (partial update);
 * nullable foreign keys translate to connect/disconnect.
 *
 * Kept as a standalone pure function (no Baileys/WaService imports) so it is
 * trivially unit-testable.
 */
export function buildAccountUpdateData(dto: UpdateAccountDto): Prisma.WhatsappAccountUpdateInput {
  const data: Prisma.WhatsappAccountUpdateInput = {};
  if (dto.accountName !== undefined) data.accountName = dto.accountName;
  if (dto.phoneNumber !== undefined) data.phoneNumber = dto.phoneNumber;
  if (dto.assignedBotId !== undefined)
    data.assignedBot = dto.assignedBotId ? { connect: { id: dto.assignedBotId } } : { disconnect: true };
  if (dto.assignedAdminId !== undefined)
    data.assignedAdmin = dto.assignedAdminId ? { connect: { id: dto.assignedAdminId } } : { disconnect: true };
  if (dto.aiMode !== undefined) data.aiMode = dto.aiMode;
  if (dto.isActive !== undefined) data.isActive = dto.isActive;
  if (dto.businessHoursEnabled !== undefined) data.businessHoursEnabled = dto.businessHoursEnabled;
  if (dto.businessHoursStart !== undefined) data.businessHoursStart = dto.businessHoursStart;
  if (dto.businessHoursEnd !== undefined) data.businessHoursEnd = dto.businessHoursEnd;
  if (dto.businessDays !== undefined) data.businessDays = dto.businessDays;
  if (dto.businessTimezone !== undefined) data.businessTimezone = dto.businessTimezone;
  if (dto.awayMessage !== undefined) data.awayMessage = dto.awayMessage;
  return data;
}
