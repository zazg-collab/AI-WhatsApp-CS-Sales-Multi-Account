import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListProposalsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;

  @IsOptional()
  @IsIn(['knowledge', 'persona', 'customer_memory', 'playbook'])
  type?: string;

  @IsOptional()
  @IsString()
  botId?: string;
}

export class EditProposalDto {
  @IsObject()
  payload!: object;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
