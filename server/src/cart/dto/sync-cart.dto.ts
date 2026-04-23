/** Cuerpo de POST /api/cart/sync. Validado en `CartService.syncFromLines`. */
export type CartSyncLine = { id: string; qty: number };

export type CartSyncBody = { lines?: CartSyncLine[] };
