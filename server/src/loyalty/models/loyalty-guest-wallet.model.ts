export interface LoyaltyGuestWallet {
  balance: number;
  displayName?: string;
  /** Últimos 4 dígitos del móvil (solo para UI admin enmascarada; no sustituye al hash). */
  phoneLast4?: string;
  createdAt: number;
  updatedAt: number;
  mergedIntoUserId?: string;
  mergedAt?: number;
}
