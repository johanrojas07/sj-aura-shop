import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import { routes } from './app.routes';
import { provideClientHydration, withHttpTransferCacheOptions, } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withFetch } from '@angular/common/http';
import { TranslateService } from './services/translate.service';
import { WindowService } from './services/window.service';
import { EnvConfigurationService } from './services/env-configuration.service';
import { BrowserHttpInterceptor } from './services/browser-http-interceptor';
import { provideAnimations } from '@angular/platform-browser/animations';


export function WindowFactory() {
  return typeof window !== 'undefined' ? window : {};
}

/** Alinea <mat-icon> con la fuente Material Symbols cargada en index.html. */
export function configureMaterialSymbols(registry: MatIconRegistry) {
  return () => {
    registry.setDefaultFontSetClass('material-symbols-outlined');
  };
}

/**
 * Evita 2 fríos a la API en paralelo: primero /api/eshop/config, luego inicia traducciones
 * (p. ej. /api/translations) para que el segundo a menudo aterrice en instancia ya calentada.
 */
function bootApiSequenceFactory(
  env: EnvConfigurationService,
  translate: TranslateService,
) {
  return () =>
    (async () => {
      await firstValueFrom(env.load());
      await translate.use('');
    })();
}

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(MatDialogModule),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
     provideClientHydration(withHttpTransferCacheOptions({
       includePostRequests: true,
       includeRequestsWithAuthHeaders: true
     })),
     provideAnimations(),
     CookieService,
     {
      provide: HTTP_INTERCEPTORS,
      useClass: BrowserHttpInterceptor,
      multi: true,
    },
    {
      provide: WindowService,
      useFactory: (WindowFactory)
    },
    {
      provide: APP_INITIALIZER,
      useFactory: bootApiSequenceFactory,
      deps: [EnvConfigurationService, TranslateService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: configureMaterialSymbols,
      deps: [MatIconRegistry],
      multi: true,
    },
    ]
};
