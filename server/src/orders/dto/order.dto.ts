import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Cart } from '../../cart/utils/cart';
import { Address } from '../models/order.model';

export class OrderDto {
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  email: string;

  /** WhatsApp / celular (obligatorio salvo pedidos con tarjeta vía Stripe). */
  @ValidateIf((o: { cardId?: string }) => !o.cardId)
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(22)
  phone?: string;

  addresses: Address[];
  cart: Cart;
  userId?: string;
  notes?: string;
  cardId?: string;

  @IsNotEmpty()
  amount: number;

  @IsNotEmpty()
  currency: string;
}
