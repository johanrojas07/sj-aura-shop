export type LoyaltyAuditType =
  | 'ORDER_COMPLETED_USER'
  | 'ORDER_COMPLETED_GUEST'
  | 'MERGE_GUEST_INTO_USER'
  | 'REDEEM_USER'
  | 'REDEEM_GUEST'
  | 'ADMIN_ADJUST'
  | 'ADMIN_TRANSFER'
  | 'MANUAL_PURCHASE';

export interface LoyaltyAuditEntry {
  type: LoyaltyAuditType;
  /** UID del actor (usuario o admin). Para canjes automáticos puede coincidir con el destinatario. */
  actorUid: string;
  targetUserId?: string;
  targetPhoneHash?: string;
  /** Positivo = ingreso, negativo = salida. */
  delta: number;
  balanceAfterUser?: number;
  balanceAfterWallet?: number;
  reason: string;
  orderId?: string;
  transferFromUserId?: string;
  transferToUserId?: string;
  transferFromPhoneHash?: string;
  transferToPhoneHash?: string;
  /** Compra manual / trazabilidad COP. */
  amountCOP?: number;
  currency?: string;
  /** Id doc en `loyalty_transactions`. */
  transactionId?: string;
  createdAt: number;
}
