import { createHmac } from 'node:crypto';

/**
 * Normaliza a dígitos internacionales (sin +), misma heurística que WhatsApp en pedidos.
 * Ej. Colombia: 10 dígitos empezando por 3 → prefijo 57.
 */
export function normalizePhoneDigits(input: string | undefined): string | null {
  const d = (input || '').replace(/\D/g, '');
  if (d.length < 8) {
    return null;
  }
  if (d.length === 10 && d.startsWith('3')) {
    return `57${d}`;
  }
  return d;
}

/** E.164 mínimo para hashing estable (`+` + dígitos). */
export function toE164FromDigits(digits: string): string {
  return `+${digits.replace(/^\+/, '')}`;
}

export function phoneHash(phoneDigitsOrE164: string, pepper: string): string {
  const d = phoneDigitsOrE164.replace(/\D/g, '');
  const e164 = toE164FromDigits(d);
  return createHmac('sha256', pepper).update(e164, 'utf8').digest('hex');
}

/** Máscara para tablas admin (ej. ****3012). */
export function maskPhoneDigits(digits: string | null | undefined): string {
  const d = (digits || '').replace(/\D/g, '');
  if (d.length < 4) {
    return '—';
  }
  return `****${d.slice(-4)}`;
}

export function resolveLoyaltyPepper(): string {
  const p =
    (process.env.LOYALTY_PHONE_PEPPER || '').trim() ||
    (process.env.COOKIE_KEY || '').trim();
  if (!p || p === 'change-me-long-random') {
    return 'dev-loyalty-pepper-unsafe-change-LOYALTY_PHONE_PEPPER';
  }
  return p;
}
