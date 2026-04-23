import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  DocumentReference,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';

import { AuthService } from '../auth/auth.service';
import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';
import { CartModel } from '../cart/models/cart.model';
import { Order, OrderStatus } from '../orders/models/order.model';
import type { LoyaltyGuestWallet } from './models/loyalty-guest-wallet.model';
import type { LoyaltyAuditEntry } from './models/loyalty-audit-entry.model';
import type { LoyaltyPointsTransaction } from './models/loyalty-points-transaction.model';
import { LoyaltyOtpService } from './loyalty-otp.service';
import {
  maskPhoneDigits,
  normalizePhoneDigits,
  phoneHash,
  resolveLoyaltyPepper,
  toE164FromDigits,
} from './utils/loyalty-phone.util';
import type { AdminManualPurchaseDto } from './dto/admin-manual-purchase.dto';

const SYSTEM_ACTOR = '__loyalty_system__';
/** Compras manuales (admin): COP por 1 punto (fijo; misma regla que el preview en el panel). */
const LOYALTY_COP_PER_POINT_PURCHASE = 1000;

/**
 * Listado admin "Clientes con puntos": límite bajo = menos lecturas y lista más ágil.
 * Subir vía `LOYALTY_ADMIN_MAX_SCAN_USERS` / `LOYALTY_ADMIN_MAX_SCAN_WALLETS` si hace falta.
 */
const ADMIN_LOYALTY_LIST_MAX_USERS = 100;
const ADMIN_LOYALTY_LIST_MAX_WALLETS = 100;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly otpService: LoyaltyOtpService,
    /** `forwardRef`: ciclo con `AuthModule` ↔ `LoyaltyModule`. */
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  private walletsCol() {
    return this.firebase.firestore.collection(COL.loyaltyGuestWallets);
  }

  private auditCol() {
    return this.firebase.firestore.collection(COL.loyaltyAuditLog);
  }

  private ordersCol() {
    return this.firebase.firestore.collection(COL.orders);
  }

  private transactionsCol() {
    return this.firebase.firestore.collection(COL.loyaltyTransactions);
  }

  /** Misma fórmula que antes en `OrdersService` (env: LOYALTY_*). */
  loyaltyPointsForOrder(cart: CartModel): number {
    const total = Math.max(0, Number(cart.totalPrice) || 0);
    const base = Math.max(0, Math.floor(Number(process.env.LOYALTY_BASE_POINTS) || 15));
    const step = Math.max(1, Math.floor(Number(process.env.LOYALTY_SPEND_PER_POINT) || 50));
    const cap = Math.max(base, Math.floor(Number(process.env.LOYALTY_MAX_POINTS) || 2000));
    const fromSpend = Math.floor(total / step);
    return Math.min(cap, base + fromSpend);
  }

  /**
   * Puntos por monto de compra manual en COP (1 punto cada 1.000 COP).
   * Distinto de `loyaltyPointsForOrder` (regla histórica del carrito web).
   */
  pointsFromPurchaseAmountCOP(amountCOP: number): number {
    return Math.max(
      0,
      Math.floor(Math.max(0, amountCOP) / LOYALTY_COP_PER_POINT_PURCHASE),
    );
  }

  private async appendAudit(entry: LoyaltyAuditEntry): Promise<void> {
    try {
      await this.auditCol().add(entry);
    } catch (e) {
      this.logger.error(
        `appendAudit failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Otorga puntos al completar pedido (usuario logado o invitado con teléfono verificado).
   * Mantiene las mismas reglas de negocio que el flujo histórico en pedidos.
   */
  async tryGrantLoyaltyOnOrderCompletion(
    orderRef: DocumentReference,
    prev: Order | null,
    updated: Order,
    newStatus: OrderStatus | string | undefined,
  ): Promise<void> {
    const userId =
      typeof updated._user === 'string' ? updated._user.trim() : '';
    const alreadyGranted = prev?.loyaltyPointsGranted === true;
    const wasCanceled = prev?.status === OrderStatus.CANCELED;
    const isCardOrder = updated.type === 'WITH_PAYMENT';
    const stripePaidPath =
      !isCardOrder ||
      prev?.status === OrderStatus.PAID ||
      prev?.status === OrderStatus.SHIPPING;

    if (
      newStatus !== OrderStatus.COMPLETED ||
      prev?.status === OrderStatus.COMPLETED ||
      alreadyGranted ||
      wasCanceled ||
      !stripePaidPath ||
      !updated.cart
    ) {
      return;
    }

    const pts = this.loyaltyPointsForOrder(updated.cart as CartModel);
    if (pts <= 0) {
      return;
    }

    if (userId) {
      await this.authService.addLoyaltyPoints(userId, pts);
      await orderRef.set(
        {
          loyaltyPointsGranted: true,
          loyaltyPointsGrantedAmount: pts,
          loyaltyPointsGrantedAt: Date.now(),
        },
        { merge: true },
      );
      await this.appendAudit({
        type: 'ORDER_COMPLETED_USER',
        actorUid: SYSTEM_ACTOR,
        targetUserId: userId,
        delta: pts,
        reason: 'order_completed',
        orderId: updated.orderId,
        createdAt: Date.now(),
      });
      return;
    }

    const phoneDigits = normalizePhoneDigits(updated.customerPhone);
    const skipOtp = process.env.LOYALTY_GUEST_SKIP_ORDER_OTP === 'true';
    const otpOk =
      skipOtp ||
      (typeof updated.loyaltyPhoneVerifiedAt === 'number' &&
        updated.loyaltyPhoneVerifiedAt > 0);
    if (!phoneDigits || !otpOk) {
      return;
    }

    const pepper = resolveLoyaltyPepper();
    const phHash = phoneHash(toE164FromDigits(phoneDigits), pepper);
    await this.addPointsToGuestWallet(phHash, pts, {
      orderId: updated.orderId,
      phoneDigits,
    });
    await orderRef.set(
      {
        loyaltyPointsGranted: true,
        loyaltyPointsGrantedAmount: pts,
        loyaltyPointsGrantedAt: Date.now(),
        loyaltyGuestWalletHash: phHash,
      },
      { merge: true },
    );
  }

  private async addPointsToGuestWallet(
    phoneHashVal: string,
    points: number,
    meta: { orderId: string; phoneDigits?: string },
  ): Promise<void> {
    const db = this.firebase.firestore;
    const n = Math.floor(points);
    if (n <= 0) {
      return;
    }
    await db.runTransaction(async (t) => {
      const wref = this.walletsCol().doc(phoneHashVal);
      const wsnap = await t.get(wref);
      const w = wsnap.exists
        ? (wsnap.data() as LoyaltyGuestWallet & { mergedIntoUserId?: string })
        : null;
      const mergedUid = w?.mergedIntoUserId?.trim();
      if (mergedUid) {
        const uref = db.collection(COL.users).doc(mergedUid);
        t.update(uref, { loyaltyPoints: FieldValue.increment(n) });
        return;
      }
      const now = Date.now();
      const last4 =
        meta.phoneDigits && meta.phoneDigits.length >= 4
          ? meta.phoneDigits.slice(-4)
          : undefined;
      if (!wsnap.exists) {
        t.set(wref, {
          balance: n,
          createdAt: now,
          updatedAt: now,
          ...(last4 ? { phoneLast4: last4 } : {}),
        } satisfies LoyaltyGuestWallet);
      } else {
        const patch: Record<string, unknown> = {
          balance: FieldValue.increment(n),
          updatedAt: now,
        };
        const existingLast4 = (w as LoyaltyGuestWallet | null)?.phoneLast4;
        if (last4 && !existingLast4) {
          patch.phoneLast4 = last4;
        }
        t.update(wref, patch as { [key: string]: unknown });
      }
    });
    await this.appendAudit({
      type: 'ORDER_COMPLETED_GUEST',
      actorUid: SYSTEM_ACTOR,
      targetPhoneHash: phoneHashVal,
      delta: n,
      reason: 'order_completed_guest',
      orderId: meta.orderId,
      createdAt: Date.now(),
    });
  }

  async requestOrderPhoneOtp(
    orderId: string,
    phone: string,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    const snap = await this.ordersCol().doc(orderId).get();
    if (!snap.exists) {
      throw new NotFoundException('Pedido no encontrado.');
    }
    const order = docWithId<Order>(snap)!;
    const a = normalizePhoneDigits(order.customerPhone);
    const b = normalizePhoneDigits(phone);
    if (!a || !b || a !== b) {
      throw new ForbiddenException(
        'El teléfono no coincide con el del pedido.',
      );
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(a), pepper);
    return this.otpService.createChallenge(hash, 'order_phone', orderId);
  }

  async confirmOrderPhoneOtp(
    orderId: string,
    phone: string,
    challengeId: string,
    code: string,
  ): Promise<{ ok: true }> {
    const snap = await this.ordersCol().doc(orderId).get();
    if (!snap.exists) {
      throw new NotFoundException('Pedido no encontrado.');
    }
    const order = docWithId<Order>(snap)!;
    const a = normalizePhoneDigits(order.customerPhone);
    const b = normalizePhoneDigits(phone);
    if (!a || !b || a !== b) {
      throw new ForbiddenException(
        'El teléfono no coincide con el del pedido.',
      );
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(a), pepper);
    await this.otpService.verifyChallenge(
      challengeId,
      code,
      hash,
      'order_phone',
      orderId,
    );
    await this.ordersCol().doc(orderId).set(
      {
        loyaltyPhoneVerifiedAt: Date.now(),
        loyaltyPhoneVerifiedHash: hash,
      },
      { merge: true },
    );
    return { ok: true };
  }

  async requestMergePhoneOtp(
    userId: string,
    phone: string,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      throw new BadRequestException('Teléfono no válido.');
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(digits), pepper);
    return this.otpService.createChallenge(hash, 'merge_phone');
  }

  async confirmMergePhoneOtp(
    userId: string,
    phone: string,
    challengeId: string,
    code: string,
  ): Promise<{ mergedPoints: number }> {
    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      throw new BadRequestException('Teléfono no válido.');
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(digits), pepper);
    await this.otpService.verifyChallenge(
      challengeId,
      code,
      hash,
      'merge_phone',
    );
    const { mergedPoints } = await this.mergeGuestWalletIntoUserByVerifiedPhone(
      userId,
      phone,
      { actorUid: userId, reason: 'merge_phone_otp' },
    );
    return { mergedPoints };
  }

  /**
   * Fusiona saldo del wallet de invitado en `users/{userId}`.
   * Idempotente si el mismo usuario ya fusionó ese móvil.
   */
  async mergeGuestWalletIntoUserByVerifiedPhone(
    userId: string,
    plainPhone: string,
    ctx: { actorUid: string; reason: string },
  ): Promise<{ mergedPoints: number }> {
    const digits = normalizePhoneDigits(plainPhone);
    if (!digits) {
      return { mergedPoints: 0 };
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(digits), pepper);
    const db = this.firebase.firestore;
    const uref = db.collection(COL.users).doc(userId);
    const wref = this.walletsCol().doc(hash);

    const mergedPoints = await db.runTransaction(async (t) => {
      const [usnap, wsnap] = await Promise.all([t.get(uref), t.get(wref)]);
      if (!usnap.exists) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      const user = usnap.data() as Record<string, unknown>;
      const existingHash =
        typeof user.loyaltyVerifiedPhoneHash === 'string'
          ? user.loyaltyVerifiedPhoneHash.trim()
          : '';
      if (existingHash && existingHash !== hash) {
        throw new BadRequestException(
          'La cuenta ya está asociada a otro móvil verificado.',
        );
      }
      if (!wsnap.exists) {
        if (!existingHash) {
          t.update(uref, { loyaltyVerifiedPhoneHash: hash });
        }
        return 0;
      }
      const w = wsnap.data() as LoyaltyGuestWallet & {
        mergedIntoUserId?: string;
      };
      if (w.mergedIntoUserId?.trim() && w.mergedIntoUserId.trim() !== userId) {
        throw new BadRequestException(
          'Este móvil ya se fusionó con otra cuenta.',
        );
      }
      if (w.mergedIntoUserId?.trim() === userId) {
        if (!existingHash) {
          t.update(uref, { loyaltyVerifiedPhoneHash: hash });
        }
        return 0;
      }
      const bal = Math.max(0, Math.floor(Number(w.balance) || 0));
      const now = Date.now();
      if (bal > 0) {
        t.update(uref, {
          loyaltyPoints: FieldValue.increment(bal),
          loyaltyVerifiedPhoneHash: hash,
        });
      } else {
        t.update(uref, { loyaltyVerifiedPhoneHash: hash });
      }
      t.set(
        wref,
        {
          balance: 0,
          mergedIntoUserId: userId,
          mergedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      return bal;
    });

    if (mergedPoints > 0) {
      await this.appendAudit({
        type: 'MERGE_GUEST_INTO_USER',
        actorUid: ctx.actorUid,
        targetUserId: userId,
        targetPhoneHash: hash,
        delta: mergedPoints,
        reason: ctx.reason,
        createdAt: Date.now(),
      });
    }
    return { mergedPoints };
  }

  async redeemAuthenticated(
    userId: string,
    points: number,
    reason?: string,
  ): Promise<{ balanceAfter: number }> {
    const n = Math.floor(points);
    if (n <= 0) {
      throw new BadRequestException('Cantidad no válida.');
    }
    const db = this.firebase.firestore;
    const ref = db.collection(COL.users).doc(userId);
    const balanceAfter = await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      const cur = Math.max(
        0,
        Math.floor(Number((snap.data() as { loyaltyPoints?: number }).loyaltyPoints) || 0),
      );
      if (cur < n) {
        throw new BadRequestException('Saldo de puntos insuficiente.');
      }
      const next = cur - n;
      t.update(ref, { loyaltyPoints: next });
      return next;
    });
    await this.appendAudit({
      type: 'REDEEM_USER',
      actorUid: userId,
      targetUserId: userId,
      delta: -n,
      balanceAfterUser: balanceAfter,
      reason: reason?.trim() || 'redeem_authenticated',
      createdAt: Date.now(),
    });
    return { balanceAfter };
  }

  async requestRedeemGuestOtp(
    phone: string,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      throw new BadRequestException('Teléfono no válido.');
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(digits), pepper);
    return this.otpService.createChallenge(hash, 'redeem_guest');
  }

  async confirmRedeemGuest(
    phone: string,
    challengeId: string,
    code: string,
    points: number,
    reason?: string,
  ): Promise<{ balanceAfter: number }> {
    const digits = normalizePhoneDigits(phone);
    if (!digits) {
      throw new BadRequestException('Teléfono no válido.');
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(digits), pepper);
    await this.otpService.verifyChallenge(
      challengeId,
      code,
      hash,
      'redeem_guest',
    );
    const n = Math.floor(points);
    if (n <= 0) {
      throw new BadRequestException('Cantidad no válida.');
    }
    const db = this.firebase.firestore;
    const wref = this.walletsCol().doc(hash);
    const balanceAfter = await db.runTransaction(async (t) => {
      const wsnap = await t.get(wref);
      if (!wsnap.exists) {
        throw new BadRequestException('No hay saldo de puntos para este móvil.');
      }
      const w = wsnap.data() as LoyaltyGuestWallet & {
        mergedIntoUserId?: string;
      };
      if (w.mergedIntoUserId?.trim()) {
        throw new BadRequestException(
          'Este móvil ya se fusionó con una cuenta: inicia sesión para canjear.',
        );
      }
      const cur = Math.max(0, Math.floor(Number(w.balance) || 0));
      if (cur < n) {
        throw new BadRequestException('Saldo de puntos insuficiente.');
      }
      const next = cur - n;
      t.update(wref, { balance: next, updatedAt: Date.now() });
      return next;
    });
    await this.appendAudit({
      type: 'REDEEM_GUEST',
      actorUid: SYSTEM_ACTOR,
      targetPhoneHash: hash,
      delta: -n,
      balanceAfterWallet: balanceAfter,
      reason: reason?.trim() || 'redeem_guest_otp',
      createdAt: Date.now(),
    });
    return { balanceAfter };
  }

  async adminAdjust(
    adminUid: string,
    dto: {
      targetType: 'user' | 'phone_wallet';
      targetUserId?: string;
      targetPhone?: string;
      targetPhoneHash?: string;
      delta: number;
      reason: string;
    },
  ): Promise<{ balanceAfterUser?: number; balanceAfterWallet?: number }> {
    const delta = Math.floor(dto.delta);
    if (delta === 0) {
      throw new BadRequestException('El ajuste no puede ser cero.');
    }
    const db = this.firebase.firestore;
    if (dto.targetType === 'user') {
      const uid = dto.targetUserId?.trim();
      if (!uid) {
        throw new BadRequestException('targetUserId requerido.');
      }
      const ref = db.collection(COL.users).doc(uid);
      const ledgerRef = this.transactionsCol().doc();
      const reasonTrim = dto.reason.trim();
      const now = Date.now();
      const out = await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) {
          throw new NotFoundException('Usuario destino no encontrado.');
        }
        const cur = Math.max(
          0,
          Math.floor(
            Number((snap.data() as { loyaltyPoints?: number }).loyaltyPoints) ||
              0,
          ),
        );
        const next = cur + delta;
        if (next < 0) {
          throw new BadRequestException(
            'El ajuste dejaría saldo negativo en la cuenta.',
          );
        }
        t.set(ledgerRef, {
          customerRef: `user|${uid}`,
          points: delta,
          type: 'ADMIN_ADJUST',
          description: `Ajuste admin. ${reasonTrim}`,
          adminUid,
          createdAt: now,
          currency: 'COP',
        } satisfies LoyaltyPointsTransaction);
        t.update(ref, { loyaltyPoints: next });
        return { balanceAfterUser: next };
      });
      await this.appendAudit({
        type: 'ADMIN_ADJUST',
        actorUid: adminUid,
        targetUserId: uid,
        delta,
        balanceAfterUser: out.balanceAfterUser,
        reason: dto.reason.trim(),
        createdAt: Date.now(),
      });
      return out;
    }

    const rawHash = dto.targetPhoneHash?.trim().toLowerCase();
    let hash: string;
    if (rawHash && /^[a-f0-9]{64}$/.test(rawHash)) {
      hash = rawHash;
    } else {
      const digits = normalizePhoneDigits(dto.targetPhone);
      if (!digits) {
        throw new BadRequestException(
          'Indica targetPhone o targetPhoneHash válido para el wallet.',
        );
      }
      hash = phoneHash(toE164FromDigits(digits), resolveLoyaltyPepper());
    }
    const wref = this.walletsCol().doc(hash);
    const reasonTrimW = dto.reason.trim();
    const ledgerRefW = this.transactionsCol().doc();
    const out = await db.runTransaction(async (t) => {
      const now = Date.now();
      const wsnap = await t.get(wref);
      const cur = wsnap.exists
        ? Math.max(0, Math.floor(Number((wsnap.data() as LoyaltyGuestWallet).balance) || 0))
        : 0;
      const next = cur + delta;
      if (next < 0) {
        throw new BadRequestException(
          'El ajuste dejaría saldo negativo en el wallet de invitado.',
        );
      }
      t.set(ledgerRefW, {
        customerRef: `guest|${hash}`,
        points: delta,
        type: 'ADMIN_ADJUST',
        description: `Ajuste admin. ${reasonTrimW}`,
        adminUid,
        createdAt: now,
        currency: 'COP',
      } satisfies LoyaltyPointsTransaction);
      if (!wsnap.exists) {
        if (delta < 0) {
          throw new BadRequestException('Wallet inexistente.');
        }
        t.set(wref, {
          balance: next,
          createdAt: now,
          updatedAt: now,
        } satisfies LoyaltyGuestWallet);
      } else {
        t.update(wref, { balance: next, updatedAt: now });
      }
      return { balanceAfterWallet: next };
    });
    await this.appendAudit({
      type: 'ADMIN_ADJUST',
      actorUid: adminUid,
      targetPhoneHash: hash,
      delta,
      balanceAfterWallet: out.balanceAfterWallet,
      reason: dto.reason.trim(),
      createdAt: Date.now(),
    });
    return out;
  }

  async adminTransfer(
    adminUid: string,
    dto: {
      fromType: 'user' | 'phone_wallet';
      toType: 'user' | 'phone_wallet';
      fromUserId?: string;
      fromPhone?: string;
      fromPhoneHash?: string;
      toUserId?: string;
      toPhone?: string;
      toPhoneHash?: string;
      amount: number;
      reason: string;
    },
  ): Promise<void> {
    const amount = Math.floor(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Importe no válido.');
    }
    const db = this.firebase.firestore;

    const walletDocFromPhoneOrHash = (
      phone?: string,
      directHash?: string,
    ): DocumentReference => {
      const raw = directHash?.trim().toLowerCase();
      if (raw && /^[a-f0-9]{64}$/.test(raw)) {
        return this.walletsCol().doc(raw);
      }
      const d = normalizePhoneDigits(phone);
      if (!d) {
        throw new BadRequestException('Indica teléfono o hash del wallet (64 hex).');
      }
      const h = phoneHash(toE164FromDigits(d), resolveLoyaltyPepper());
      return this.walletsCol().doc(h);
    };

    const resolveFromRef = (): {
      kind: 'user' | 'wallet';
      ref: DocumentReference;
    } => {
      if (dto.fromType === 'user') {
        const uid = dto.fromUserId?.trim();
        if (!uid) {
          throw new BadRequestException('fromUserId requerido.');
        }
        return { kind: 'user', ref: db.collection(COL.users).doc(uid) };
      }
      return {
        kind: 'wallet',
        ref: walletDocFromPhoneOrHash(dto.fromPhone, dto.fromPhoneHash),
      };
    };

    const resolveToRef = (): {
      kind: 'user' | 'wallet';
      ref: DocumentReference;
    } => {
      if (dto.toType === 'user') {
        const uid = dto.toUserId?.trim();
        if (!uid) {
          throw new BadRequestException('toUserId requerido.');
        }
        return { kind: 'user', ref: db.collection(COL.users).doc(uid) };
      }
      return {
        kind: 'wallet',
        ref: walletDocFromPhoneOrHash(dto.toPhone, dto.toPhoneHash),
      };
    };

    const from = resolveFromRef();
    const to = resolveToRef();
    if (from.ref.path === to.ref.path) {
      throw new BadRequestException('Origen y destino no pueden ser el mismo.');
    }

    const txOutRef = this.transactionsCol().doc();
    const txInRef = this.transactionsCol().doc();
    const reasonT = dto.reason.trim();

    await db.runTransaction(async (t) => {
      const [fromSnap, toSnap] = await Promise.all([
        t.get(from.ref),
        t.get(to.ref),
      ]);
      if (!fromSnap.exists) {
        throw new NotFoundException('Origen no encontrado.');
      }
      if (!toSnap.exists && to.kind === 'user') {
        throw new NotFoundException('Usuario destino no encontrado.');
      }

      let fromBal = 0;
      if (from.kind === 'user') {
        fromBal = Math.max(
          0,
          Math.floor(
            Number(
              (fromSnap.data() as { loyaltyPoints?: number }).loyaltyPoints,
            ) || 0,
          ),
        );
      } else {
        const w = fromSnap.data() as LoyaltyGuestWallet & {
          mergedIntoUserId?: string;
        };
        if (w.mergedIntoUserId?.trim()) {
          throw new BadRequestException(
            'El wallet de origen ya fue fusionado con una cuenta.',
          );
        }
        fromBal = Math.max(0, Math.floor(Number(w.balance) || 0));
      }

      if (fromBal < amount) {
        throw new BadRequestException('INSUFFICIENT_BALANCE');
      }

      const fromNext = fromBal - amount;
      if (from.kind === 'user') {
        t.update(from.ref, { loyaltyPoints: fromNext });
      } else {
        t.update(from.ref, {
          balance: fromNext,
          updatedAt: Date.now(),
        });
      }

      const now = Date.now();
      if (to.kind === 'user') {
        const toData = toSnap.data() as { loyaltyPoints?: number };
        const toBal = Math.max(
          0,
          Math.floor(Number(toData?.loyaltyPoints) || 0),
        );
        t.update(to.ref, { loyaltyPoints: toBal + amount });
      } else {
        if (!toSnap.exists) {
          t.set(to.ref, {
            balance: amount,
            createdAt: now,
            updatedAt: now,
          } satisfies LoyaltyGuestWallet);
        } else {
          const tw = toSnap.data() as LoyaltyGuestWallet & {
            mergedIntoUserId?: string;
          };
          if (tw.mergedIntoUserId?.trim()) {
            throw new BadRequestException(
              'El wallet destino ya fue fusionado con una cuenta.',
            );
          }
          const toBal = Math.max(0, Math.floor(Number(tw.balance) || 0));
          t.update(to.ref, { balance: toBal + amount, updatedAt: now });
        }
      }

      const fromCustomerRef: string =
        from.kind === 'user'
          ? `user|${(dto.fromUserId || '').trim()}`
          : `guest|${from.ref.id}`;
      const toCustomerRef: string =
        to.kind === 'user'
          ? `user|${(dto.toUserId || '').trim()}`
          : `guest|${to.ref.id}`;
      t.set(txOutRef, {
        customerRef: fromCustomerRef,
        points: -amount,
        type: 'ADMIN_TRANSFER',
        description: `Transferencia enviada. ${reasonT}`,
        adminUid,
        createdAt: now,
        currency: 'COP',
      } satisfies LoyaltyPointsTransaction);
      t.set(txInRef, {
        customerRef: toCustomerRef,
        points: amount,
        type: 'ADMIN_TRANSFER',
        description: `Transferencia recibida. ${reasonT}`,
        adminUid,
        createdAt: now,
        currency: 'COP',
      } satisfies LoyaltyPointsTransaction);
    });

    await this.appendAudit({
      type: 'ADMIN_TRANSFER',
      actorUid: adminUid,
      delta: amount,
      reason: dto.reason.trim(),
      transferFromUserId:
        dto.fromType === 'user' ? dto.fromUserId?.trim() : undefined,
      transferToUserId: dto.toType === 'user' ? dto.toUserId?.trim() : undefined,
      transferFromPhoneHash:
        dto.fromType === 'phone_wallet'
          ? dto.fromPhoneHash?.trim().toLowerCase() &&
            /^[a-f0-9]{64}$/.test(dto.fromPhoneHash.trim().toLowerCase())
            ? dto.fromPhoneHash.trim().toLowerCase()
            : dto.fromPhone
              ? phoneHash(
                  toE164FromDigits(normalizePhoneDigits(dto.fromPhone)!),
                  resolveLoyaltyPepper(),
                )
              : undefined
          : undefined,
      transferToPhoneHash:
        dto.toType === 'phone_wallet'
          ? dto.toPhoneHash?.trim().toLowerCase() &&
            /^[a-f0-9]{64}$/.test(dto.toPhoneHash.trim().toLowerCase())
            ? dto.toPhoneHash.trim().toLowerCase()
            : dto.toPhone
              ? phoneHash(
                  toE164FromDigits(normalizePhoneDigits(dto.toPhone)!),
                  resolveLoyaltyPepper(),
                )
              : undefined
          : undefined,
      createdAt: Date.now(),
    });
  }

  /** Ref: `user|{uid}` o `guest|{phoneHash}` (puede venir URL-encoded desde query). */
  parseCustomerRefParam(encoded: string): { kind: 'user'; userId: string } | { kind: 'guest'; phoneHash: string } {
    let raw = encoded.trim();
    if (raw.includes('%')) {
      try {
        raw = decodeURIComponent(raw);
      } catch {
        /* usar raw */
      }
    }
    if (raw.startsWith('user|')) {
      const userId = raw.slice(5).trim();
      if (!userId) {
        throw new BadRequestException('Referencia de cliente no válida.');
      }
      return { kind: 'user', userId };
    }
    if (raw.startsWith('guest|')) {
      const phoneHashVal = raw.slice(6).trim();
      if (!phoneHashVal || !/^[a-f0-9]{64}$/i.test(phoneHashVal)) {
        throw new BadRequestException('Referencia de invitado no válida.');
      }
      return { kind: 'guest', phoneHash: phoneHashVal.toLowerCase() };
    }
    throw new BadRequestException('Referencia de cliente no válida.');
  }

  private async buildActivityMapFromAuditTail(maxDocs: number): Promise<Map<string, number>> {
    if (maxDocs <= 0) {
      return new Map();
    }
    const snap = await this.auditCol()
      .orderBy('createdAt', 'desc')
      .limit(Math.min(5000, Math.max(50, maxDocs)))
      .get();
    const map = new Map<string, number>();
    for (const d of snap.docs) {
      const x = d.data() as LoyaltyAuditEntry;
      const ts = typeof x.createdAt === 'number' ? x.createdAt : 0;
      const bump = (key: string) => {
        const cur = map.get(key);
        if (cur === undefined || ts > cur) {
          map.set(key, ts);
        }
      };
      if (x.targetUserId?.trim()) {
        bump(`u:${x.targetUserId.trim()}`);
      }
      if (x.targetPhoneHash?.trim()) {
        bump(`h:${x.targetPhoneHash.trim().toLowerCase()}`);
      }
      if (x.transferFromUserId?.trim()) {
        bump(`u:${x.transferFromUserId.trim()}`);
      }
      if (x.transferToUserId?.trim()) {
        bump(`u:${x.transferToUserId.trim()}`);
      }
      if (x.transferFromPhoneHash?.trim()) {
        bump(`h:${x.transferFromPhoneHash.trim().toLowerCase()}`);
      }
      if (x.transferToPhoneHash?.trim()) {
        bump(`h:${x.transferToPhoneHash.trim().toLowerCase()}`);
      }
      if (x.actorUid?.trim() && x.actorUid !== SYSTEM_ACTOR) {
        bump(`u:${x.actorUid.trim()}`);
      }
    }
    return map;
  }

  /**
   * Listado unificado para el dashboard admin (solo `users` + `loyalty_guest_wallets`: puntos y datos básicos).
   * No lee `loyalty_audit_log` aquí; la auditoría completa va por `GET .../loyalty/audit` o el detalle del cliente.
   */
  async listAdminCustomers(params: {
    page: number;
    pageSize: number;
    sort: 'points_desc' | 'points_asc' | 'name_asc' | 'activity_desc';
    type: 'all' | 'registered' | 'guest';
    q?: string;
    minPoints?: number;
    maxPoints?: number;
  }): Promise<{
    items: Array<{
      ref: string;
      kind: 'registered' | 'guest';
      name: string | null;
      email: string | null;
      phoneMasked: string;
      points: number;
      lastActivityAt: number | null;
      mergedIntoUserId?: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
    scanMeta: {
      usersScanned: number;
      walletsScanned: number;
      auditsScanned: number;
      capped: boolean;
    };
  }> {
    const page = Math.max(1, Math.floor(params.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 20));
    const maxUsers = Math.min(
      2000,
      Math.max(
        50,
        Math.floor(
          Number(process.env.LOYALTY_ADMIN_MAX_SCAN_USERS) ||
            ADMIN_LOYALTY_LIST_MAX_USERS,
        ),
      ),
    );
    const maxWallets = Math.min(
      2000,
      Math.max(
        50,
        Math.floor(
          Number(process.env.LOYALTY_ADMIN_MAX_SCAN_WALLETS) ||
            ADMIN_LOYALTY_LIST_MAX_WALLETS,
        ),
      ),
    );

    const db = this.firebase.firestore;

    const fetchUsersSnap = async (): Promise<QuerySnapshot | null> => {
      if (params.type === 'guest') {
        return null;
      }
      try {
        return await db
          .collection(COL.users)
          .orderBy('loyaltyPoints', 'desc')
          .limit(maxUsers)
          .get();
      } catch {
        return await db.collection(COL.users).limit(maxUsers).get();
      }
    };

    const fetchWalletsSnap = async (): Promise<QuerySnapshot | null> => {
      if (params.type === 'registered') {
        return null;
      }
      try {
        return await this.walletsCol()
          .orderBy('balance', 'desc')
          .limit(maxWallets)
          .get();
      } catch {
        return await this.walletsCol().limit(maxWallets).get();
      }
    };

    const [uSnap, wSnap] = await Promise.all([fetchUsersSnap(), fetchWalletsSnap()]);

    let usersScanned = 0;
    let walletsScanned = 0;
    let capped = false;

    const userRows: Array<{
      ref: string;
      kind: 'registered' | 'guest';
      name: string | null;
      email: string | null;
      phoneMasked: string;
      points: number;
      lastActivityAt: number | null;
      mergedIntoUserId?: string;
    }> = [];

    if (uSnap) {
      usersScanned = uSnap.size;
      capped = capped || uSnap.size >= maxUsers;
      for (const d of uSnap.docs) {
        const row = d.data() as Record<string, unknown>;
        const points = Math.max(
          0,
          Math.floor(Number(row.loyaltyPoints) || 0),
        );
        const name =
          typeof row.name === 'string' && row.name.trim()
            ? row.name.trim()
            : null;
        const email =
          typeof row.email === 'string' && row.email.trim()
            ? row.email.trim()
            : null;
        const phoneMasked = '—';
        const lastActivityAt =
          typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt)
            ? row.updatedAt
            : null;
        userRows.push({
          ref: `user|${d.id}`,
          kind: 'registered',
          name,
          email,
          phoneMasked,
          points,
          lastActivityAt,
        });
      }
    }

    const guestRows: typeof userRows = [];
    if (wSnap) {
      walletsScanned = wSnap.size;
      capped = capped || wSnap.size >= maxWallets;
      for (const d of wSnap.docs) {
        const row = d.data() as unknown as LoyaltyGuestWallet & {
          mergedIntoUserId?: string;
        };
        const points = Math.max(0, Math.floor(Number(row.balance) || 0));
        const merged = row.mergedIntoUserId?.trim();
        if (merged && points <= 0) {
          continue;
        }
        const phoneMasked = row.phoneLast4
          ? `****${row.phoneLast4}`
          : `****${d.id.slice(-4)}`;
        const lastActivityAt =
          typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt)
            ? row.updatedAt
            : null;
        guestRows.push({
          ref: `guest|${d.id}`,
          kind: 'guest',
          name:
            typeof row.displayName === 'string' && row.displayName.trim()
              ? row.displayName.trim()
              : null,
          email: null,
          phoneMasked,
          points,
          lastActivityAt,
          ...(merged ? { mergedIntoUserId: merged } : {}),
        });
      }
    }

    let merged = [...userRows, ...guestRows];
    const qRaw = (params.q || '').trim();
    const q = qRaw.toLowerCase();
    const qDigitOnly = qRaw.replace(/\D/g, '');
    const qLast4 =
      qDigitOnly.length >= 4 ? qDigitOnly.slice(-4) : '';
    if (q) {
      merged = merged.filter((r) => {
        const hay = `${r.name ?? ''} ${r.email ?? ''} ${r.phoneMasked}`.toLowerCase();
        if (hay.includes(q)) {
          return true;
        }
        if (qLast4 && r.kind === 'guest') {
          const pmD = (r.phoneMasked || '').replace(/\D/g, '');
          if (pmD.length >= 4 && pmD.slice(-4) === qLast4) {
            return true;
          }
        }
        return false;
      });
    }
    const minP =
      params.minPoints !== undefined && Number.isFinite(params.minPoints)
        ? Math.max(0, Math.floor(params.minPoints))
        : undefined;
    const maxP =
      params.maxPoints !== undefined && Number.isFinite(params.maxPoints)
        ? Math.max(0, Math.floor(params.maxPoints))
        : undefined;
    if (minP !== undefined) {
      merged = merged.filter((r) => r.points >= minP);
    }
    if (maxP !== undefined) {
      merged = merged.filter((r) => r.points <= maxP);
    }

    const sort = params.sort || 'points_desc';
    merged.sort((a, b) => {
      if (sort === 'points_asc') {
        return a.points - b.points;
      }
      if (sort === 'name_asc') {
        const an = (a.name || a.email || a.phoneMasked || '').toLowerCase();
        const bn = (b.name || b.email || b.phoneMasked || '').toLowerCase();
        return an.localeCompare(bn);
      }
      if (sort === 'activity_desc') {
        const at = a.lastActivityAt ?? 0;
        const bt = b.lastActivityAt ?? 0;
        return bt - at;
      }
      return b.points - a.points;
    });

    const total = merged.length;
    const slice = merged.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: slice,
      total,
      page,
      pageSize,
      scanMeta: {
        usersScanned,
        walletsScanned,
        auditsScanned: 0,
        capped,
      },
    };
  }

  async getAdminCustomerDetail(encodedRef: string): Promise<{
    ref: string;
    kind: 'registered' | 'guest';
    name: string | null;
    email: string | null;
    phoneMasked: string;
    points: number;
    lastActivityAt: number | null;
    mergedIntoUserId?: string;
    /** Solo invitado: hash interno para ajustes/transferencias desde el panel. */
    walletHash?: string;
    audits: LoyaltyAuditEntry[];
    orders: Array<{
      orderId: string;
      status?: string;
      dateAdded?: number;
      amount?: number;
      currency?: string;
      loyaltyPointsGrantedAmount?: number;
    }>;
    transactions: Array<LoyaltyPointsTransaction & { _id: string }>;
  }> {
    const parsed = this.parseCustomerRefParam(encodedRef);
    const db = this.firebase.firestore;

    if (parsed.kind === 'user') {
      const snap = await db.collection(COL.users).doc(parsed.userId).get();
      if (!snap.exists) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      const row = snap.data() as Record<string, unknown>;
      const points = Math.max(
        0,
        Math.floor(Number(row.loyaltyPoints) || 0),
      );
      const name =
        typeof row.name === 'string' && row.name.trim()
          ? row.name.trim()
          : null;
      const email =
        typeof row.email === 'string' && row.email.trim()
          ? row.email.trim()
          : null;
      const uid = parsed.userId;
      const customerRef = `user|${uid}`;
      const [audits, transactions, ordersSnap] = await Promise.all([
        this.fetchAuditBundleForUser(uid, 48),
        this.listTransactionsForCustomerRef(customerRef, 48),
        this.ordersCol().where('_user', '==', uid).limit(28).get(),
      ]);
      const lastActivityAt =
        typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt)
          ? row.updatedAt
          : null;
      const orders = ordersSnap.docs
        .map((d) => {
          const o = docWithId<Order>(d)!;
          return {
            orderId: o.orderId || d.id,
            status: o.status,
            dateAdded: o.dateAdded,
            amount: o.amount,
            currency: o.currency,
            loyaltyPointsGrantedAmount: o.loyaltyPointsGrantedAmount,
          };
        })
        .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      return {
        ref: `user|${uid}`,
        kind: 'registered',
        name,
        email,
        phoneMasked: '—',
        points,
        lastActivityAt,
        audits,
        orders,
        transactions,
      };
    }

    const wsnap = await this.walletsCol().doc(parsed.phoneHash).get();
    if (!wsnap.exists) {
      throw new NotFoundException('Wallet de invitado no encontrado.');
    }
    const w = wsnap.data() as LoyaltyGuestWallet & { mergedIntoUserId?: string };
    const points = Math.max(0, Math.floor(Number(w.balance) || 0));
    const phoneMasked = w.phoneLast4
      ? `****${w.phoneLast4}`
      : `****${parsed.phoneHash.slice(-4)}`;
    const guestRef = `guest|${parsed.phoneHash}`;
    const mergedUidEarly = w.mergedIntoUserId?.trim();
    const txGuestP = this.listTransactionsForCustomerRef(guestRef, 48);
    const txUserP = mergedUidEarly
      ? this.listTransactionsForCustomerRef(`user|${mergedUidEarly}`, 48)
      : Promise.resolve(
          [] as Array<LoyaltyPointsTransaction & { _id: string }>,
        );
    const ph = parsed.phoneHash;
    const ordersPP = Promise.all([
      this.ordersCol()
        .where('loyaltyGuestWalletHash', '==', ph)
        .limit(24)
        .get(),
      this.ordersCol()
        .where('loyaltyPhoneVerifiedHash', '==', ph)
        .limit(24)
        .get(),
    ]);
    const [
      [snapTarget, snapTrFrom, snapTrTo],
      [o1, o2],
      transactionsGuest,
      txUserForMerge,
    ] = await Promise.all([
      Promise.all([
        this.auditCol().where('targetPhoneHash', '==', ph).limit(48).get(),
        this.auditCol()
          .where('transferFromPhoneHash', '==', ph)
          .limit(48)
          .get(),
        this.auditCol()
          .where('transferToPhoneHash', '==', ph)
          .limit(48)
          .get(),
      ]),
      ordersPP,
      txGuestP,
      txUserP,
    ]);
    const auditById = new Map<string, LoyaltyAuditEntry>();
    for (const s of [snapTarget, snapTrFrom, snapTrTo]) {
      for (const d of s.docs) {
        auditById.set(d.id, d.data() as LoyaltyAuditEntry);
      }
    }
    const audits = Array.from(auditById.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );
    const mapOrderLite = (d: QueryDocumentSnapshot) => {
      const o = docWithId<Order>(d)!;
      return {
        orderId: o.orderId || d.id,
        status: o.status,
        dateAdded: o.dateAdded,
        amount: o.amount,
        currency: o.currency,
        loyaltyPointsGrantedAmount: o.loyaltyPointsGrantedAmount,
      };
    };
    type OrderLite = ReturnType<typeof mapOrderLite>;
    const orderMap = new Map<string, OrderLite>();
    for (const d of o1.docs) {
      orderMap.set(d.id, mapOrderLite(d));
    }
    for (const d of o2.docs) {
      orderMap.set(d.id, mapOrderLite(d));
    }
    const orders = Array.from(orderMap.values()).sort(
      (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0),
    );
    let transactions = transactionsGuest;
    const mergedUid = mergedUidEarly;
    if (mergedUid) {
      const map = new Map<string, LoyaltyPointsTransaction & { _id: string }>();
      for (const x of [...transactionsGuest, ...txUserForMerge]) {
        map.set(x._id, x);
      }
      transactions = Array.from(map.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      );
      transactions = transactions.slice(0, 80);
    }
    const lastActivityAtGuest =
      typeof w.updatedAt === 'number' && Number.isFinite(w.updatedAt)
        ? w.updatedAt
        : null;
    return {
      ref: `guest|${parsed.phoneHash}`,
      kind: 'guest',
      walletHash: parsed.phoneHash,
      name:
        typeof w.displayName === 'string' && w.displayName.trim()
          ? w.displayName.trim()
          : null,
      email: null,
      phoneMasked,
      points,
      lastActivityAt: lastActivityAtGuest,
      ...(mergedUid ? { mergedIntoUserId: mergedUid } : {}),
      audits,
      orders,
      transactions,
    };
  }

  private async fetchAuditBundleForUser(
    uid: string,
    perQueryLimit = 48,
  ): Promise<LoyaltyAuditEntry[]> {
    const cap = Math.min(80, Math.max(12, Math.floor(perQueryLimit)));
    const col = this.auditCol();
    const [a, b, c] = await Promise.all([
      col.where('targetUserId', '==', uid).limit(cap).get(),
      col.where('transferFromUserId', '==', uid).limit(cap).get(),
      col.where('transferToUserId', '==', uid).limit(cap).get(),
    ]);
    const map = new Map<string, LoyaltyAuditEntry>();
    for (const snap of [a, b, c]) {
      for (const d of snap.docs) {
        map.set(d.id, d.data() as LoyaltyAuditEntry);
      }
    }
    return Array.from(map.values()).sort(
      (x, y) => (y.createdAt || 0) - (x.createdAt || 0),
    );
  }

  async listTransactionsForCustomerRef(
    customerRef: string,
    limit: number,
  ): Promise<Array<LoyaltyPointsTransaction & { _id: string }>> {
    const cap = Math.min(200, Math.max(1, Math.floor(limit)));
    const col = this.transactionsCol();
    const mapDocs = (snap: QuerySnapshot) =>
      snap.docs.map((d) => ({
        _id: d.id,
        ...(d.data() as LoyaltyPointsTransaction),
      }));
    try {
      const snap = await col
        .where('customerRef', '==', customerRef)
        .orderBy('createdAt', 'desc')
        .limit(cap)
        .get();
      return mapDocs(snap);
    } catch (e) {
      this.logger.warn(
        `listTransactions: orderBy(createdAt) failed for ${customerRef} — ` +
          `síndice compuesto quizá faltante; reintentando sin orden. ` +
          (e instanceof Error ? e.message : String(e)),
      );
      const snap = await col
        .where('customerRef', '==', customerRef)
        .limit(Math.min(200, cap * 2))
        .get();
      const rows = mapDocs(snap);
      return rows
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, cap);
    }
  }

  /**
   * Registra una compra manual (COP), acredita puntos (1 pt / 1.000 COP) y escribe ledger + auditoría.
   */
  async recordManualPurchaseAdmin(
    adminUid: string,
    dto: AdminManualPurchaseDto,
  ): Promise<{
    transactionId: string;
    points: number;
    amountCOP: number;
    customerRef: string;
    balanceAfterUser?: number;
    balanceAfterWallet?: number;
  }> {
    const amount = Math.floor(Number(dto.amountCOP));
    if (!Number.isFinite(amount) || amount < 1) {
      throw new BadRequestException('El monto debe ser un entero mayor que 0.');
    }
    const pts = this.pointsFromPurchaseAmountCOP(amount);
    const minCop = LOYALTY_COP_PER_POINT_PURCHASE;
    if (pts < 1) {
      throw new BadRequestException(
        `El monto es demasiado bajo para generar puntos (se requiere al menos ${minCop} COP por 1 punto).`,
      );
    }

    const note = (dto.note || '').trim();
    const descBase = 'Compra manual (registro admin)';
    const description = note ? `${descBase} — ${note}` : descBase;
    const displayName = (dto.displayName || '').trim() || undefined;

    const db = this.firebase.firestore;
    const txRef = this.transactionsCol().doc();
    const now = Date.now();
    const pepper = resolveLoyaltyPepper();

    const appendManualAudit = async (entry: {
      targetUserId?: string;
      targetPhoneHash?: string;
      balanceAfterUser?: number;
      balanceAfterWallet?: number;
    }) => {
      await this.appendAudit({
        type: 'MANUAL_PURCHASE',
        actorUid: adminUid,
        targetUserId: entry.targetUserId,
        targetPhoneHash: entry.targetPhoneHash,
        delta: pts,
        balanceAfterUser: entry.balanceAfterUser,
        balanceAfterWallet: entry.balanceAfterWallet,
        reason: description,
        amountCOP: amount,
        currency: 'COP',
        transactionId: txRef.id,
        createdAt: Date.now(),
      });
    };

    const creditRegisteredUser = async (uid: string, customerRef: string) => {
      const uref = db.collection(COL.users).doc(uid);
      const balanceAfterUser = await db.runTransaction(async (t) => {
        const snap = await t.get(uref);
        if (!snap.exists) {
          throw new NotFoundException('Usuario no encontrado.');
        }
        const cur = Math.max(
          0,
          Math.floor(
            Number((snap.data() as { loyaltyPoints?: number }).loyaltyPoints) ||
              0,
          ),
        );
        const next = cur + pts;
        t.set(txRef, {
          customerRef,
          points: pts,
          type: 'MANUAL_PURCHASE',
          amountCOP: amount,
          currency: 'COP',
          description,
          adminUid,
          createdAt: now,
        } satisfies LoyaltyPointsTransaction);
        t.update(uref, { loyaltyPoints: next });
        return next;
      });
      await appendManualAudit({
        targetUserId: uid,
        balanceAfterUser,
      });
      return {
        transactionId: txRef.id,
        points: pts,
        amountCOP: amount,
        customerRef,
        balanceAfterUser,
      };
    };

    const trTrim = dto.targetRef?.trim();
    if (trTrim) {
      const parsed = this.parseCustomerRefParam(trTrim);
      if (parsed.kind === 'user') {
        return creditRegisteredUser(parsed.userId, `user|${parsed.userId}`);
      }

      const hash = parsed.phoneHash;
      const wref = this.walletsCol().doc(hash);
      const result = await db.runTransaction(async (t) => {
        const wsnap = await t.get(wref);
        const w = wsnap.exists
          ? (wsnap.data() as LoyaltyGuestWallet & { mergedIntoUserId?: string })
          : null;
        const mergedUid = w?.mergedIntoUserId?.trim();
        if (mergedUid) {
          const uref = db.collection(COL.users).doc(mergedUid);
          const usnap = await t.get(uref);
          if (!usnap.exists) {
            throw new BadRequestException(
              'El wallet está fusionado con un usuario inexistente.',
            );
          }
          const cur = Math.max(
            0,
            Math.floor(
              Number(
                (usnap.data() as { loyaltyPoints?: number }).loyaltyPoints,
              ) || 0,
            ),
          );
          const next = cur + pts;
          t.set(txRef, {
            customerRef: `user|${mergedUid}`,
            points: pts,
            type: 'MANUAL_PURCHASE',
            amountCOP: amount,
            currency: 'COP',
            description: `${description} (wallet invitado fusionado)`,
            adminUid,
            createdAt: now,
          } satisfies LoyaltyPointsTransaction);
          t.update(uref, { loyaltyPoints: next });
          return {
            mode: 'merged_user' as const,
            mergedUid,
            balanceAfterUser: next,
          };
        }

        const cur = wsnap.exists
          ? Math.max(
              0,
              Math.floor(Number((w as LoyaltyGuestWallet).balance) || 0),
            )
          : 0;
        const next = cur + pts;
        if (!wsnap.exists) {
          const initial: Record<string, unknown> = {
            balance: next,
            createdAt: now,
            updatedAt: now,
          };
          if (displayName) {
            initial.displayName = displayName;
          }
          t.set(wref, initial as unknown as LoyaltyGuestWallet);
        } else {
          const patch: Record<string, unknown> = {
            balance: FieldValue.increment(pts),
            updatedAt: now,
          };
          if (displayName && !(w as LoyaltyGuestWallet).displayName?.trim()) {
            patch.displayName = displayName;
          }
          t.update(wref, patch as { [key: string]: unknown });
        }
        t.set(txRef, {
          customerRef: `guest|${hash}`,
          points: pts,
          type: 'MANUAL_PURCHASE',
          amountCOP: amount,
          currency: 'COP',
          description,
          adminUid,
          createdAt: now,
        } satisfies LoyaltyPointsTransaction);
        return { mode: 'guest' as const, balanceAfterWallet: next };
      });

      if (result.mode === 'merged_user') {
        await appendManualAudit({
          targetUserId: result.mergedUid,
          targetPhoneHash: hash,
          balanceAfterUser: result.balanceAfterUser,
        });
        return {
          transactionId: txRef.id,
          points: pts,
          amountCOP: amount,
          customerRef: `user|${result.mergedUid}`,
          balanceAfterUser: result.balanceAfterUser,
        };
      }
      await appendManualAudit({
        targetPhoneHash: hash,
        balanceAfterWallet: result.balanceAfterWallet,
      });
      return {
        transactionId: txRef.id,
        points: pts,
        amountCOP: amount,
        customerRef: `guest|${hash}`,
        balanceAfterWallet: result.balanceAfterWallet,
      };
    }

    const digits = normalizePhoneDigits(dto.phone || '');
    if (!digits) {
      throw new BadRequestException('Teléfono no válido.');
    }
    const hash = phoneHash(toE164FromDigits(digits), pepper);
    const wref = this.walletsCol().doc(hash);
    const last4 = digits.length >= 4 ? digits.slice(-4) : undefined;

    const result2 = await db.runTransaction(async (t) => {
      const wsnap = await t.get(wref);
      const w = wsnap.exists
        ? (wsnap.data() as LoyaltyGuestWallet & { mergedIntoUserId?: string })
        : null;
      const mergedUid = w?.mergedIntoUserId?.trim();
      if (mergedUid) {
        const uref = db.collection(COL.users).doc(mergedUid);
        const usnap = await t.get(uref);
        if (!usnap.exists) {
          throw new BadRequestException(
            'El móvil está fusionado con un usuario inexistente.',
          );
        }
        const cur = Math.max(
          0,
          Math.floor(
            Number(
              (usnap.data() as { loyaltyPoints?: number }).loyaltyPoints,
            ) || 0,
          ),
        );
        const next = cur + pts;
        t.set(txRef, {
          customerRef: `user|${mergedUid}`,
          points: pts,
          type: 'MANUAL_PURCHASE',
          amountCOP: amount,
          currency: 'COP',
          description: `${description} (acreditado a cuenta fusionada)`,
          adminUid,
          createdAt: now,
        } satisfies LoyaltyPointsTransaction);
        t.update(uref, { loyaltyPoints: next });
        return {
          mode: 'merged_user' as const,
          mergedUid,
          balanceAfterUser: next,
          phoneHash: hash,
        };
      }

      const cur = wsnap.exists
        ? Math.max(0, Math.floor(Number((w as LoyaltyGuestWallet).balance) || 0))
        : 0;
      const next = cur + pts;
      if (!wsnap.exists) {
        const initial: Record<string, unknown> = {
          balance: next,
          createdAt: now,
          updatedAt: now,
        };
        if (last4) {
          initial.phoneLast4 = last4;
        }
        if (displayName) {
          initial.displayName = displayName;
        }
        t.set(wref, initial as unknown as LoyaltyGuestWallet);
      } else {
        const patch: Record<string, unknown> = {
          balance: FieldValue.increment(pts),
          updatedAt: now,
        };
        if (last4 && !(w as LoyaltyGuestWallet).phoneLast4) {
          patch.phoneLast4 = last4;
        }
        if (displayName && !(w as LoyaltyGuestWallet).displayName?.trim()) {
          patch.displayName = displayName;
        }
        t.update(wref, patch as { [key: string]: unknown });
      }
      t.set(txRef, {
        customerRef: `guest|${hash}`,
        points: pts,
        type: 'MANUAL_PURCHASE',
        amountCOP: amount,
        currency: 'COP',
        description,
        adminUid,
        createdAt: now,
      } satisfies LoyaltyPointsTransaction);
      return {
        mode: 'guest' as const,
        balanceAfterWallet: next,
        phoneHash: hash,
      };
    });

    if (result2.mode === 'merged_user') {
      await appendManualAudit({
        targetUserId: result2.mergedUid,
        targetPhoneHash: result2.phoneHash,
        balanceAfterUser: result2.balanceAfterUser,
      });
      return {
        transactionId: txRef.id,
        points: pts,
        amountCOP: amount,
        customerRef: `user|${result2.mergedUid}`,
        balanceAfterUser: result2.balanceAfterUser,
      };
    }
    await appendManualAudit({
      targetPhoneHash: result2.phoneHash,
      balanceAfterWallet: result2.balanceAfterWallet,
    });
    return {
      transactionId: txRef.id,
      points: pts,
      amountCOP: amount,
      customerRef: `guest|${result2.phoneHash}`,
      balanceAfterWallet: result2.balanceAfterWallet,
    };
  }

  /**
   * Busca un cliente por teléfono (misma normalización y hash que la compra manual), sin modificar datos.
   */
  async lookupCustomerByPhoneForAdmin(phone: string): Promise<{
    valid: boolean;
    found: boolean;
    kind: 'registered' | 'guest' | 'new';
    name: string | null;
    email: string | null;
    points: number;
    ref: string | null;
    phoneMasked: string;
  }> {
    const d = normalizePhoneDigits(phone);
    const masked = maskPhoneDigits(d);
    if (!d) {
      return {
        valid: false,
        found: false,
        kind: 'new',
        name: null,
        email: null,
        points: 0,
        ref: null,
        phoneMasked: '—',
      };
    }
    if (d.length < 8) {
      return {
        valid: false,
        found: false,
        kind: 'new',
        name: null,
        email: null,
        points: 0,
        ref: null,
        phoneMasked: masked,
      };
    }
    const pepper = resolveLoyaltyPepper();
    const hash = phoneHash(toE164FromDigits(d), pepper);
    const db = this.firebase.firestore;
    const wsnap = await this.walletsCol().doc(hash).get();
    if (wsnap.exists) {
      const w = wsnap.data() as LoyaltyGuestWallet & {
        mergedIntoUserId?: string;
        displayName?: string;
        balance?: number;
      };
      const merged = w.mergedIntoUserId?.trim();
      if (merged) {
        const us = await db.collection(COL.users).doc(merged).get();
        if (us.exists) {
          const u = us.data() as Record<string, unknown>;
          const name =
            typeof u.name === 'string' && u.name.trim() ? u.name.trim() : null;
          const email =
            typeof u.email === 'string' && u.email.trim() ? u.email.trim() : null;
          const points = Math.max(
            0,
            Math.floor(Number((u.loyaltyPoints as number) ?? 0) || 0),
          );
          return {
            valid: true,
            found: true,
            kind: 'registered',
            name,
            email,
            points,
            ref: `user|${merged}`,
            phoneMasked: masked,
          };
        }
      }
      const name =
        typeof w.displayName === 'string' && w.displayName.trim()
          ? w.displayName.trim()
          : null;
      const points = Math.max(0, Math.floor(Number(w.balance) || 0));
      return {
        valid: true,
        found: true,
        kind: 'guest',
        name,
        email: null,
        points,
        ref: `guest|${hash}`,
        phoneMasked: masked,
      };
    }

    try {
      const uq = await db
        .collection(COL.users)
        .where('loyaltyVerifiedPhoneHash', '==', hash)
        .limit(1)
        .get();
      if (!uq.empty) {
        const doc = uq.docs[0];
        const u = doc.data() as Record<string, unknown>;
        const name =
          typeof u.name === 'string' && u.name.trim() ? u.name.trim() : null;
        const email =
          typeof u.email === 'string' && u.email.trim() ? u.email.trim() : null;
        const points = Math.max(
          0,
          Math.floor(Number((u.loyaltyPoints as number) ?? 0) || 0),
        );
        return {
          valid: true,
          found: true,
          kind: 'registered',
          name,
          email,
          points,
          ref: `user|${doc.id}`,
          phoneMasked: masked,
        };
      }
    } catch (e) {
      this.logger.warn(
        'lookupCustomerByPhoneForAdmin: query users by loyaltyVerifiedPhoneHash failed; treating as new guest if no wallet.',
        e as Error,
      );
    }

    return {
      valid: true,
      found: false,
      kind: 'new',
      name: null,
      email: null,
      points: 0,
      ref: null,
      phoneMasked: masked,
    };
  }

  async listAuditEntries(params: {
    limit: number;
    targetUserId?: string;
    targetPhoneHash?: string;
  }): Promise<LoyaltyAuditEntry[]> {
    let q = this.auditCol().orderBy('createdAt', 'desc').limit(params.limit);
    if (params.targetUserId?.trim()) {
      q = this.auditCol()
        .where('targetUserId', '==', params.targetUserId.trim())
        .limit(params.limit);
    } else if (params.targetPhoneHash?.trim()) {
      q = this.auditCol()
        .where('targetPhoneHash', '==', params.targetPhoneHash.trim())
        .limit(params.limit);
    }
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as LoyaltyAuditEntry);
  }
}
