export class CreatePersonaDto {
  name!: string;
  soulMd!: string;
  tone?: string;
  style?: string;
  rules?: string;
  forbiddenWords?: string[];
}

export class UpdatePersonaDto {
  name?: string;
  soulMd?: string;
  tone?: string;
  style?: string;
  rules?: string;
  forbiddenWords?: string[];
}
