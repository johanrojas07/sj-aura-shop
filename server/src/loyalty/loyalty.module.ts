import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyOtpService } from './loyalty-otp.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyAdminController } from './loyalty-admin.controller';

@Module({
  imports: [ConfigModule.forRoot(), forwardRef(() => AuthModule)],
  controllers: [LoyaltyController, LoyaltyAdminController],
  providers: [LoyaltyService, LoyaltyOtpService],
  exports: [LoyaltyService, LoyaltyOtpService],
})
export class LoyaltyModule {}
