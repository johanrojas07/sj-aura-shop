import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { TranslationsController } from './translations.controller';
import { TranslationsService } from './translations.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, HttpModule],
  controllers: [TranslationsController],
  providers: [TranslationsService],
  exports: [TranslationsService],
})
export class TranslationsModule {}
