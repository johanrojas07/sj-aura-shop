import { AnalyticsService } from './analytics.service';
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { shareReplay, map, catchError, tap } from 'rxjs/operators';

import { ApiService } from './api.service';
import { ThemeService } from './theme.service';
import { cssUrl } from '../shared/utils/css-url';

export interface Config {
  FE_STRIPE_PUBLISHABLE_KEY?: string;
  FE_TINYMCE_API_KEY?: string;
  FE_RECAPTCHA_CLIENT_KEY?: string;
  FE_ANALYTICS_TOKEN?: string;
  [name: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class EnvConfigurationService {
  public configuration$: Observable<Config>;
  public config: Config;

  constructor(
    private apiService: ApiService,
    private themeService: ThemeService,
    private analyticsService: AnalyticsService,
    @Inject(PLATFORM_ID)
    private platformId: Object
  ) {}

  getConfigType$(type: string): Observable<string> {
    return this.configuration$.pipe(map((configuration: Config) => configuration[type]));
  }

  setTheme(conf: Config) {
    if (conf.styles) {
      Object.keys(conf.styles).map((style) => {
        const styleValue = conf.styles[style];
        if (styleValue) {
          const varName = style
            .split(/(?=[A-Z])/)
            .join('-')
            .toLowerCase();

          if (style === 'promoSlideBackground') {
            this.themeService.setCSSVariable(cssUrl(String(styleValue)), `${varName}`);
            return;
          }
          if (style === 'promoSlideBackgroundPosition') {
            this.themeService.setCSSVariable(`${styleValue}`, `${varName}`);
            return;
          }
          if (style === 'mainBackground') {
            const v = String(styleValue);
            const isSolid =
              v.startsWith('#') ||
              v.startsWith('rgb') ||
              v.startsWith('hsl') ||
              v.startsWith('var(');
            if (isSolid) {
              this.themeService.setCSSVariable(v, varName);
            } else {
              this.themeService.setCSSVariable(cssUrl(String(styleValue)), `${varName}-url`);
            }
            return;
          }
          if (style === 'logo') {
            this.themeService.setCSSVariable(cssUrl(String(styleValue)), 'logo');
            return;
          }
          if (style === 'promoSlideVideo') {
           this.themeService.setVideo(styleValue);
          }

          this.themeService.setCSSVariable(styleValue, varName);
          if (style.includes('Color')) {
            if (style.includes('primary')) {
              this.themeService.setThemeColor(styleValue, 'theme-primary');
            }

            if (style.includes('secondary')) {
              this.themeService.setThemeColor(styleValue, 'theme-secondary');
            }
          }
        }
      });
    }
  }

  load(): Observable<Config> {
    if (!this.configuration$) {
      this.configuration$ = this.apiService.getConfig().pipe(
        map((response: { config?: string; error?: unknown }) => {
          if (response && 'error' in response && response.error) {
            return {} as Config;
          }
          try {
            return response?.config ? (JSON.parse(atob(response.config)) as Config) : ({} as Config);
          } catch {
            return {} as Config;
          }
        }),
        catchError(() => of({} as Config)),
        tap((conf) => {
          this.config = conf;
          if (isPlatformBrowser(this.platformId)) {
            this.setTheme(conf);
            this.analyticsService.initial(conf);
          }
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.configuration$;
  }
}
