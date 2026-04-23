import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminLoyaltyAdjustDto {
  @IsIn(['user', 'phone_wallet'])
  targetType: 'user' | 'phone_wallet';

  /** UID Firebase cuando targetType = user */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  targetUserId?: string;

  /** Teléfono en formato habitual del checkout cuando targetType = phone_wallet */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(22)
  targetPhone?: string;

  /** Hash del wallet (64 hex); alternativa a targetPhone para el panel admin. */
  @IsOptional()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  targetPhoneHash?: string;

  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  delta: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class AdminLoyaltyTransferDto {
  @IsIn(['user', 'phone_wallet'])
  fromType: 'user' | 'phone_wallet';

  @IsIn(['user', 'phone_wallet'])
  toType: 'user' | 'phone_wallet';

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  fromUserId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(22)
  fromPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  toUserId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(22)
  toPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  fromPhoneHash?: string;

  @IsOptional()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  toPhoneHash?: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
