import { firstValueFrom } from 'rxjs';
import { Controller, Get, Query, UseGuards, Patch, Body } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

import { Translation } from './translation.model';
import { TranslationsService } from './translations.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { countryLang, languages } from '../shared/constans';

@Controller('api/translations')
export class TranslationsController {
  constructor(
    private readonly translationsService: TranslationsService,
    private readonly httpService: HttpService,
  ) {}

  @Get()
  async getTranslations(@Query('lang') lang: string): Promise<Translation | null> {
    if (!lang) {
      const url = `https://geolocation-db.com/json/${process.env.GEO_LOCATION_API_KEY}`;
      try {
        const result = await firstValueFrom(this.httpService.post(url));
        const country = result.data.country_code
          ? result.data.country_code.toLowerCase()
          : '';
        const raw = countryLang[country] || countryLang['default'];
        const langCode = languages.includes(raw as (typeof languages)[number]) ? raw : languages[0];

        return await this.translationsService.findByLang(langCode);
      } catch {
        return await this.translationsService.findByLang(languages[0]);
      }
    }

    const safeLang = languages.includes(lang as (typeof languages)[number]) ? lang : languages[0];
    return await this.translationsService.findByLang(safeLang);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Get('all')
  async getAllTranslations(): Promise<Translation[]> {
    return this.translationsService.findAll();
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Patch('all')
  async updateTranslations(@Body() translations: Translation[]): Promise<Translation[]> {
    await this.translationsService.updateAll(translations);
    return this.translationsService.findAll();
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Patch()
  async updateTranslation(
    @Query('lang') lang: string,
    @Body() translation: { keys?: Record<string, unknown> },
  ): Promise<Translation | null> {
    const safeLang = languages.includes(lang as (typeof languages)[number]) ? lang : languages[0];
    await this.translationsService.upsertTranslation(safeLang, translation.keys ?? {});
    return this.translationsService.findByLang(safeLang);
  }
}
