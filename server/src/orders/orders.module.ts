import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WhatsAppOrderNotifyService } from './whatsapp-order-notify.service';

@Module({
  imports: [ConfigModule.forRoot(), AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, WhatsAppOrderNotifyService],
})
export class OrdersModule {}
