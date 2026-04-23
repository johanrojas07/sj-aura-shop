import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdminManualPurchaseDto {
  /** Teléfono del cliente (obligatorio si no se envía `targetRef`). */
  @ValidateIf((o: AdminManualPurchaseDto) => !String(o.targetRef || '').trim())
  @IsString()
  @MinLength(8)
  @MaxLength(22)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  /** Monto de compra en COP (> 0). */
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCOP: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Cliente existente: `user|{uid}` (p. ej. elegido desde búsqueda).
   * Si se omite, se acredita al wallet de invitado del teléfono (creándolo si no existe).
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetRef?: string;
}
