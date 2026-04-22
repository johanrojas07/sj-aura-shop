import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { AuthModule } from '../auth/auth.module';
import { EshopController } from './eshop.controller';
import { EshopService } from './eshop.service';

@Module({
  imports: [AuthModule, ConfigModule.forRoot(), HttpModule],
  controllers: [EshopController],
  providers: [EshopService],
})
export class EshopModule {}
