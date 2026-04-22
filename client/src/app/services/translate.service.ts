import { BehaviorSubject, Observable } from 'rxjs';
import { Injectable, Injector } from '@angular/core';
import { CookieService } from 'ngx-cookie-service';

import { languages } from '../shared/constants';
import { Translations } from '../shared/models';
import { take } from 'rxjs/operators';
import { defaultTranslationsForLang } from '../shared/translation-defaults';

/**
 * No importar `ApiService` de forma estática aquí: con SSR/Vite y el store + HTTP,
 * el orden de evaluación de módulos puede dejar clases en `undefined` y romper el DI
 * (p. ej. `HeaderComponent_Factory`). Las traducciones resuelven `ApiService` vía import dinámico.
 */

@Injectable({
  providedIn: 'root'
})
export class TranslateService {

  translationsSub$  : BehaviorSubject<{[key: string]: string}> = new BehaviorSubject({});
  languageSub$      = new BehaviorSubject('');
  lang: string;

  constructor(private injector: Injector) {}

  private get cookie(): CookieService {
    return this.injector.get(CookieService);
  }

  getLang$() {
    return this.languageSub$.asObservable();
  }

  getTranslations$(): Observable<{[key: string]: string}> {
    return this.translationsSub$.asObservable();
  }

  getTranslationsData(lang: string): void {
    void import('./api.service')
      .then(({ ApiService }) => {
        const api = this.injector.get(ApiService);
        return api.getLangTranslations(lang).pipe(take(1)).subscribe({
          next: (translations: Translations & { error?: unknown }) => {
            if (translations && 'error' in translations && translations.error) {
              const defaults = defaultTranslationsForLang(lang || languages[0]);
              this.translationsSub$.next(defaults);
              return;
            }
            if (!lang && translations) {
              this.setLang(translations.lang);
            } else if (!lang) {
              this.setLang(languages[0]);
            }
            const fromApi =
              translations && translations['keys']
                ? (translations['keys'] as Record<string, string>)
                : {};
            const langResolved = (translations as { lang?: string })?.lang || lang;
            const defaults = defaultTranslationsForLang(langResolved);
            const merged: Record<string, string> = { ...defaults, ...fromApi };
            this.translationsSub$.next(merged);
          },
          error: () => {
            const defaults = defaultTranslationsForLang(lang || languages[0]);
            this.translationsSub$.next(defaults);
          },
        });
      })
      .catch(() => {
        const defaults = defaultTranslationsForLang(lang || languages[0]);
        this.translationsSub$.next(defaults);
      });
  }

  use(lang: string): Promise<{}> {
    return new Promise<{}>((resolve) => {
      const foundLang = lang || this.cookie.get('eshop_lang');
      this.setTranslations(foundLang);
      resolve({});
    });
  }

  private setTranslations(lang: string): void {
    if (lang) {
      this.setLang(lang);
    } else {
      this.setLang(languages[0]);
    }

    const langToSend = lang || languages[0];

    this.getTranslationsData(langToSend);
  }

  private setLang(lang: string): void {
    this.languageSub$.next(lang);
    this.cookie.set('eshop_lang', lang);
    this.lang = lang;
  }
}
