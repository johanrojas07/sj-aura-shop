import { CartModel } from '../../cart/models/cart.model';

export enum OrderStatus {
  NEW = 'NEW',
  PAID = 'PAID',
  SHIPPING = 'SHIPPING',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
}

export interface Address {
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  zip: string;
  country: string;
  region?: string;
}

export interface Order {
  orderId: string;
  amount: number;
  amount_refunded?: number;
  currency: string;
  cart: CartModel;
  status: OrderStatus;
  customerEmail: string;
  /** Teléfono / WhatsApp indicado en el checkout. */
  customerPhone?: string;
  addresses: Address[];
  notes?: string;
  type?: string;
  description?: string;
  outcome?: { seller_message: string };
  dateAdded: number;
  cardId?: string;
  _user?: string;
  /** Puntos de fidelidad ya abonados por este pedido (evita doble conteo). */
  loyaltyPointsGranted?: boolean;
  loyaltyPointsGrantedAmount?: number;
  loyaltyPointsGrantedAt?: number;
  [key: string]: unknown;
}
