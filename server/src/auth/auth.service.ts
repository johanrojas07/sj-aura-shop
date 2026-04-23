import {
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { EshopUser } from './models/user.model';
import { PatchProfileDto } from './dto/patch-profile.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly firebase: FirebaseService,
    @Optional()
    @Inject(forwardRef(() => LoyaltyService))
    private readonly loyaltyService?: LoyaltyService,
  ) {}

  async getOrCreateUserFromFirebase(
    decoded: admin.auth.DecodedIdToken,
  ): Promise<EshopUser> {
    const db = this.firebase.firestore;
    const uid = decoded.uid;
    const ref = db.collection(COL.users).doc(uid);
    const snap = await ref.get();

    if (snap.exists) {
      const row = docWithId<EshopUser>(snap)!;
      const user = this.normalizeUser(row, uid);
      this.maybeMergeLoyaltyFromFirebasePhone(uid, decoded);
      return user;
    }

    const emailToStore =
      decoded.email?.toLowerCase() ?? `${uid}@firebase.local`;
    const nameFromToken =
      typeof decoded.name === 'string' && decoded.name.trim()
        ? decoded.name.trim().slice(0, 120)
        : undefined;
    const newDoc = {
      firebaseUid: uid,
      email: emailToStore,
      roles: [] as string[],
      cart: { items: [] },
      images: [] as string[],
      loyaltyPoints: 0,
      ...(nameFromToken ? { name: nameFromToken } : {}),
    };
    await ref.set(newDoc);
    const created = { _id: uid, ...newDoc } as EshopUser;
    this.maybeMergeLoyaltyFromFirebasePhone(uid, decoded);
    return this.normalizeUser(created, uid);
  }

  /**
   * Si el token de Firebase incluye `phone_number` (p. ej. acceso con SMS),
   * intenta fusionar puntos del wallet de invitado con la misma clave de móvil.
   */
  private maybeMergeLoyaltyFromFirebasePhone(
    uid: string,
    decoded: admin.auth.DecodedIdToken,
  ): void {
    if (!this.loyaltyService) {
      return;
    }
    const phone =
      typeof decoded.phone_number === 'string'
        ? decoded.phone_number.trim()
        : '';
    if (!phone) {
      return;
    }
    void this.loyaltyService
      .mergeGuestWalletIntoUserByVerifiedPhone(uid, phone, {
        actorUid: uid,
        reason: 'firebase_id_token_phone_number',
      })
      .catch((e: unknown) =>
        this.logger.warn(
          `Fusión de puntos (token Firebase) omitida: ${
            e instanceof Error ? e.message : String(e)
          }`,
        ),
      );
  }

  async patchProfile(uid: string, dto: PatchProfileDto): Promise<EshopUser> {
    const ref = this.firebase.firestore.collection(COL.users).doc(uid);
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const t = String(dto.name).trim().slice(0, 120);
      patch.name = t.length ? t : FieldValue.delete();
    }
    if (Object.keys(patch).length > 0) {
      await ref.update(patch);
    }
    const snap = await ref.get();
    const row = docWithId<EshopUser>(snap);
    if (!row) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }
    return this.normalizeUser(row, uid);
  }

  private normalizeUser(row: EshopUser, uid: string): EshopUser {
    const lp =
      typeof row.loyaltyPoints === 'number' && Number.isFinite(row.loyaltyPoints)
        ? Math.max(0, Math.floor(row.loyaltyPoints))
        : 0;
    return {
      ...row,
      _id: uid,
      firebaseUid: row.firebaseUid ?? uid,
      roles: row.roles ?? [],
      cart: row.cart ?? { items: [] },
      loyaltyPoints: lp,
    };
  }

  /**
   * Suma puntos de fidelidad al documento `users/{uid}`.
   * Puntos base y ratio opcionales vía env: LOYALTY_BASE_POINTS (def. 15), LOYALTY_SPEND_PER_POINT (def. 50) = 1 pt cada N unidades de moneda del carrito.
   */
  async addLoyaltyPoints(uid: string, points: number): Promise<void> {
    const n = Math.floor(points);
    if (!uid?.trim() || n <= 0) {
      return;
    }
    const ref = this.firebase.firestore.collection(COL.users).doc(uid.trim());
    try {
      await ref.update({ loyaltyPoints: FieldValue.increment(n) });
    } catch (err: unknown) {
      this.logger.warn(`addLoyaltyPoints(${uid}, ${n}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
