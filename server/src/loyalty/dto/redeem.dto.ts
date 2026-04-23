import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RedeemAuthenticatedDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  points: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RequestRedeemGuestOtpDto {
  @IsString()
  @MinLength(8)
  @MaxLength(22)
  phone: string;
}

export class ConfirmRedeemGuestDto extends RequestRedeemGuestOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  points: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
