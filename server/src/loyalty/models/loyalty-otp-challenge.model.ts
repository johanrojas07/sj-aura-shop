export type LoyaltyOtpPurpose = 'order_phone' | 'merge_phone' | 'redeem_guest';

export interface LoyaltyOtpChallenge {
  phoneHash: string;
  purpose: LoyaltyOtpPurpose;
  orderId?: string;
  codeDigest: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}
