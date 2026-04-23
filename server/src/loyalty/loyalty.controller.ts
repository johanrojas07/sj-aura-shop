import {
  Body,
  Controller,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';

import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { GetUser } from '../auth/utils/get-user.decorator';
import type { EshopUser } from '../auth/models/user.model';
import { LoyaltyService } from './loyalty.service';
import {
  ConfirmOrderPhoneOtpDto,
  RequestOrderPhoneOtpDto,
} from './dto/order-phone-otp.dto';
import {
  ConfirmMergePhoneOtpDto,
  RequestMergePhoneOtpDto,
} from './dto/merge-phone.dto';
import {
  ConfirmRedeemGuestDto,
  RedeemAuthenticatedDto,
  RequestRedeemGuestOtpDto,
} from './dto/redeem.dto';

/**
 * Fidelización: verificación de móvil en pedidos invitados, fusión con cuenta, canjes.
 * SMS real: integrar proveedor externo; el OTP se genera aquí (ver `LOYALTY_OTP_DEBUG` en desarrollo).
 */
@Controller('api/loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Post('order-phone-otp/request')
  async requestOrderPhoneOtp(
    @Body(ValidationPipe) dto: RequestOrderPhoneOtpDto,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    return this.loyalty.requestOrderPhoneOtp(dto.orderId, dto.phone);
  }

  @Post('order-phone-otp/confirm')
  async confirmOrderPhoneOtp(
    @Body(ValidationPipe) dto: ConfirmOrderPhoneOtpDto,
  ): Promise<{ ok: true }> {
    return this.loyalty.confirmOrderPhoneOtp(
      dto.orderId,
      dto.phone,
      dto.challengeId,
      dto.code,
    );
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('merge-phone/request')
  async requestMergePhoneOtp(
    @GetUser() user: EshopUser,
    @Body(ValidationPipe) dto: RequestMergePhoneOtpDto,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    return this.loyalty.requestMergePhoneOtp(user._id, dto.phone);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('merge-phone/confirm')
  async confirmMergePhoneOtp(
    @GetUser() user: EshopUser,
    @Body(ValidationPipe) dto: ConfirmMergePhoneOtpDto,
  ): Promise<{ mergedPoints: number }> {
    return this.loyalty.confirmMergePhoneOtp(
      user._id,
      dto.phone,
      dto.challengeId,
      dto.code,
    );
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('redeem')
  async redeemAuthenticated(
    @GetUser() user: EshopUser,
    @Body(ValidationPipe) dto: RedeemAuthenticatedDto,
  ): Promise<{ balanceAfter: number }> {
    return this.loyalty.redeemAuthenticated(
      user._id,
      dto.points,
      dto.reason,
    );
  }

  @Post('redeem-guest/request-otp')
  async requestRedeemGuestOtp(
    @Body(ValidationPipe) dto: RequestRedeemGuestOtpDto,
  ): Promise<{ challengeId: string; debugCode?: string }> {
    return this.loyalty.requestRedeemGuestOtp(dto.phone);
  }

  @Post('redeem-guest/confirm')
  async confirmRedeemGuest(
    @Body(ValidationPipe) dto: ConfirmRedeemGuestDto,
  ): Promise<{ balanceAfter: number }> {
    return this.loyalty.confirmRedeemGuest(
      dto.phone,
      dto.challengeId,
      dto.code,
      dto.points,
      dto.reason,
    );
  }
}
