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
  [key: string]: unknown;
}
