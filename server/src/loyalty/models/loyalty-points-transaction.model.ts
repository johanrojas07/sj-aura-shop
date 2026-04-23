/**
 * Ledger explícito de movimientos de puntos (complementa `loyalty_audit_log`).
 * `customerRef`: `user|{firebaseUid}` o `guest|{phoneHash}`.
 */
export type LoyaltyPointsTransactionType =
  | 'MANUAL_PURCHASE'
  | 'ORDER_COMPLETED'
  | 'MERGE'
  | 'REDEEM'
  | 'ADMIN_ADJUST'
  | 'ADMIN_TRANSFER';

export interface LoyaltyPointsTransaction {
  customerRef: string;
  points: number;
  type: LoyaltyPointsTransactionType;
  /** Monto en COP asociado a la compra (manual u orden), si aplica. */
  amountCOP?: number;
  currency: 'COP';
  description: string;
  adminUid?: string;
  createdAt: number;
  /** Id del documento Firestore (se rellena al leer). */
  _id?: string;
}
