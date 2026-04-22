import { Body, Controller, Get, Patch, UseGuards, ValidationPipe } from '@nestjs/common';

import { AuthService } from './auth.service';
import { PatchProfileDto } from './dto/patch-profile.dto';
import { EshopUser } from './models/user.model';
import { GetUser } from './utils/get-user.decorator';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';

export type AuthProfileResponse = {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  loyaltyPoints: number;
};

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private toProfileResponse(user: EshopUser): AuthProfileResponse {
    const nameRaw = typeof user.name === 'string' ? user.name.trim() : '';
    return {
      id: user._id,
      email: user.email,
      name: nameRaw.length ? nameRaw.slice(0, 120) : null,
      roles: user.roles ?? [],
      loyaltyPoints:
        typeof user.loyaltyPoints === 'number' && Number.isFinite(user.loyaltyPoints)
          ? Math.max(0, Math.floor(user.loyaltyPoints))
          : 0,
    };
  }

  @UseGuards(FirebaseAuthGuard)
  @Get()
  getUser(@GetUser() user: EshopUser): AuthProfileResponse {
    return this.toProfileResponse(user);
  }

  @UseGuards(FirebaseAuthGuard)
  @Patch()
  patchProfile(
    @GetUser() user: EshopUser,
    @Body(ValidationPipe) dto: PatchProfileDto,
  ): Promise<AuthProfileResponse> {
    return this.authService
      .patchProfile(user._id, dto)
      .then((u) => this.toProfileResponse(u));
  }
}
