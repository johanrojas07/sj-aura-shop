import { createHash, randomInt } from 'node:crypto';

import { Injectable, BadRequestException, Logger } from '@nestjs/common';

import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';
import type { LoyaltyOtpChallenge, LoyaltyOtpPurpose } from './models/loyalty-otp-challenge.model';

const MAX_ATTEMPTS = 8;
const TTL_MS = 15 * 60 * 1000;

@Injectable()
export class LoyaltyOtpService {
  private readonly logger = new Logger(LoyaltyOtpService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private otpSecret(): string {
    const s =
      (process.env.LOYALTY_OTP_SECRET || '').trim() ||
      (process.env.LOYALTY_PHONE_PEPPER || '').trim() ||
      (process.env.COOKIE_KEY || '').trim();
    if (!s) {
      return 'dev-loyalty-otp-secret';
    }
    return s;
  }

  private digestCode(
    code: string,
    challengeId: string,
    phoneHash: string,
    purpose: LoyaltyOtpPurpose,
    orderId?: string,
  ): string {
    const payload = `${this.otpSecret()}|${code}|${challengeId}|${phoneHash}|${purpose}|${orderId ?? ''}`;
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  private challengesCol() {
    return this.firebase.firestore.collection(COL.loyaltyOtpChallenges);
  }

  /**
   * Crea un reto OTP de 6 dígitos. Si `LOYALTY_OTP_DEBUG=1`, el código aparece en logs (solo desarrollo).
   */
  async createChallenge(
    phoneHash: string,
    purpose: LoyaltyOtpPurpose,
    orderId?: string,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    const challengeId = `${Date.now()}_${randomInt(1_000_000, 9_999_999)}`;
    const code = String(randomInt(100_000, 999_999));
    const codeDigest = this.digestCode(code, challengeId, phoneHash, purpose, orderId);
    const now = Date.now();
    const doc: LoyaltyOtpChallenge = {
      phoneHash,
      purpose,
      ...(orderId ? { orderId } : {}),
      codeDigest,
      expiresAt: now + TTL_MS,
      attempts: 0,
      createdAt: now,
    };
    await this.challengesCol().doc(challengeId).set(doc);
    let debugCode: string | undefined;
    if (process.env.LOYALTY_OTP_DEBUG === '1') {
      this.logger.warn(`OTP debug challengeId=${challengeId} code=${code} purpose=${purpose}`);
      debugCode = code;
    }
    return { challengeId, debugCode };
  }

  async verifyChallenge(
    challengeId: string,
    code: string,
    phoneHash: string,
    purpose: LoyaltyOtpPurpose,
    orderId?: string,
  ): Promise<void> {
    const ref = this.challengesCol().doc(challengeId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new BadRequestException('Código de verificación no válido o expirado.');
    }
    const row = docWithId<LoyaltyOtpChallenge & { _id: string }>(snap)!;
    if (row.phoneHash !== phoneHash || row.purpose !== purpose) {
      throw new BadRequestException('Código de verificación no válido.');
    }
    if (orderId && row.orderId && row.orderId !== orderId) {
      throw new BadRequestException('Pedido no coincide con el reto.');
    }
    if (Date.now() > row.expiresAt) {
      await ref.delete().catch(() => undefined);
      throw new BadRequestException('Código expirado. Solicita uno nuevo.');
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Demasiados intentos. Solicita un código nuevo.');
    }
    const digest = this.digestCode(code.trim(), challengeId, phoneHash, purpose, row.orderId);
    if (digest !== row.codeDigest) {
      await ref.update({ attempts: row.attempts + 1 });
      throw new BadRequestException('Código incorrecto.');
    }
    await ref.delete().catch(() => undefined);
  }
}
