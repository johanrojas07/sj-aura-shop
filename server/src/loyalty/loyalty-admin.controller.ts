import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';

import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../auth/utils/get-user.decorator';
import type { EshopUser } from '../auth/models/user.model';
import type { LoyaltyAuditEntry } from './models/loyalty-audit-entry.model';
import { LoyaltyService } from './loyalty.service';
import {
  AdminLoyaltyAdjustDto,
  AdminLoyaltyTransferDto,
} from './dto/admin-loyalty.dto';
import { AdminManualPurchaseDto } from './dto/admin-manual-purchase.dto';

@Controller('api/admin/loyalty')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class LoyaltyAdminController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('customers')
  listCustomers(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('sort') sort?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('minPoints') minPointsRaw?: string,
    @Query('maxPoints') maxPointsRaw?: string,
  ) {
    const page = Math.max(1, parseInt(String(pageRaw ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(String(pageSizeRaw ?? '20'), 10) || 20));
    const sortNorm = (
      ['points_desc', 'points_asc', 'name_asc', 'activity_desc'].includes(String(sort))
        ? sort
        : 'points_desc'
    ) as 'points_desc' | 'points_asc' | 'name_asc' | 'activity_desc';
    const typeNorm = (
      ['all', 'registered', 'guest'].includes(String(type)) ? type : 'all'
    ) as 'all' | 'registered' | 'guest';
    const minPoints =
      minPointsRaw !== undefined && minPointsRaw !== ''
        ? parseInt(String(minPointsRaw), 10)
        : undefined;
    const maxPoints =
      maxPointsRaw !== undefined && maxPointsRaw !== ''
        ? parseInt(String(maxPointsRaw), 10)
        : undefined;
    return this.loyalty.listAdminCustomers({
      page,
      pageSize,
      sort: sortNorm,
      type: typeNorm,
      q: q?.trim(),
      minPoints: Number.isFinite(minPoints) ? minPoints : undefined,
      maxPoints: Number.isFinite(maxPoints) ? maxPoints : undefined,
    });
  }

  @Get('customers/detail')
  customerDetail(@Query('ref') ref?: string) {
    if (!ref?.trim()) {
      throw new BadRequestException('Parámetro ref requerido.');
    }
    return this.loyalty.getAdminCustomerDetail(ref.trim());
  }

  /** Búsqueda por teléfono para el formulario de compra manual (vista previa, sin mutar). */
  @Get('customers/lookup-phone')
  lookupPhone(@Query('phone') phone?: string) {
    return this.loyalty.lookupCustomerByPhoneForAdmin(phone || '');
  }

  @Post('manual-purchase')
  async manualPurchase(
    @GetUser() admin: EshopUser,
    @Body(ValidationPipe) dto: AdminManualPurchaseDto,
  ) {
    return this.loyalty.recordManualPurchaseAdmin(admin._id, dto);
  }

  @Post('adjust')
  async adjust(
    @GetUser() admin: EshopUser,
    @Body(ValidationPipe) dto: AdminLoyaltyAdjustDto,
  ): Promise<{ balanceAfterUser?: number; balanceAfterWallet?: number }> {
    return this.loyalty.adminAdjust(admin._id, dto);
  }

  @Post('transfer')
  async transfer(
    @GetUser() admin: EshopUser,
    @Body(ValidationPipe) dto: AdminLoyaltyTransferDto,
  ): Promise<{ ok: true }> {
    await this.loyalty.adminTransfer(admin._id, dto);
    return { ok: true };
  }

  @Get('audit')
  async audit(
    @Query('targetUserId') targetUserId?: string,
    @Query('targetPhoneHash') targetPhoneHash?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<LoyaltyAuditEntry[]> {
    const parsed = parseInt(String(limitRaw ?? '50'), 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(parsed) ? parsed : 50));
    return this.loyalty.listAuditEntries({
      limit,
      targetUserId: targetUserId?.trim() || undefined,
      targetPhoneHash: targetPhoneHash?.trim() || undefined,
    });
  }
}
