import { CartModel } from '../../cart/models/cart.model';

/** Usuario de sesión API (perfil en Firestore `users/{uid}`). */
export interface EshopUser {
  _id: string;
  firebaseUid: string;
  email: string;
  name?: string;
  cart?: CartModel;
  images?: string[];
  roles?: string[];
  /** Puntos de fidelidad (Firestore); se incrementan al completar pedidos. */
  loyaltyPoints?: number;
  /** Hash HMAC del último móvil verificado para fidelización (evita merges duplicados). */
  loyaltyVerifiedPhoneHash?: string;
  [key: string]: unknown;
}
