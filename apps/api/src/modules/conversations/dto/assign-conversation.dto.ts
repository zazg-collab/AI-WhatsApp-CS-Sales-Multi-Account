import { IsOptional, IsUUID } from 'class-validator';

export class AssignConversationDto {
  /** Admin user id, or omit/null to unassign. */
  @IsOptional()
  @IsUUID()
  adminId?: string | null;
}
