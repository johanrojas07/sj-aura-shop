import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
