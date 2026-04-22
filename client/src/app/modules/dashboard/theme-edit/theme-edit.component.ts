import { toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, BehaviorSubject } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import { languages } from '../../../shared/constants';
import { ThemeService } from '../../../services/theme.service';
import { cssUrl } from '../../../shared/utils/css-url';
import { Theme } from '../../../shared/models';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { SignalStore } from '../../../store/signal.store';
import { ApiService } from '../../../services/api.service';


@Component({
    selector: 'app-theme-edit',
    templateUrl: './theme-edit.component.html',
    styleUrls: ['./theme-edit.component.scss'],
    standalone: false
})
export class ThemeEditComponent implements OnInit {
  themes$: Observable<Theme[]>;
  themesEditForm: FormGroup;
  languageOptions = languages;
  choosenLanguageSub$ = new BehaviorSubject(languages[0]);
  newTheme = '';
  chosenTheme = '';
  sendRequest = false;

  constructor(
      private store: SignalStore,
      private selectos: SignalStoreSelectors,
      private fb: FormBuilder,
      private themeService: ThemeService,
      private apiService: ApiService,
      @Inject(PLATFORM_ID) private platformId: object,
      ) {
    this.store.getThemes();

    this.themesEditForm = this.fb.group({
      titleUrl: ['', Validators.required],
      ...this.startFormValues()
    });

    this.themes$ = toObservable(this.selectos.themes);

    this.themesEditForm.valueChanges.subscribe((values) => {
      this.themeService.setCSSVariable(values.primaryColor, 'primary-color');
      this.themeService.setCSSVariable(values.secondaryColor, 'secondary-color');
      this.themeService.setCSSVariable(values.backgroundColor, 'background-color');
      this.themeService.setThemeColor(values.primaryColor, 'theme-primary');
      this.themeService.setThemeColor(values.secondaryColor, 'theme-secondary');
      if (values.mainBackground) {
        this.themeService.setCSSVariable(values.mainBackground, 'main-background');
        this.themeService.setCSSVariable(cssUrl(values.mainBackground), 'main-background-url');
      } else {
        this.themeService.setCSSVariable(`url(/)`, 'main-background-url');
      }
      this.themeService.setCSSVariable(values.freeShippingPromo, 'free-shipping-promo');
      const promoBg = (values.promoSlideBackground || '').trim();
      if (promoBg) {
        this.themeService.setCSSVariable(cssUrl(promoBg), 'promo-slide-background');
      }
      this.themeService.setCSSVariable(`${values.promoSlideBackgroundPosition}`, 'promo-slide-background-position');
      this.themeService.setVideo(values.promoSlideVideo);
      this.themeService.setCSSVariable(values.promo, 'promo');
      const logo = (values.logo || '').trim();
      if (logo) {
        this.themeService.setCSSVariable(cssUrl(logo), 'logo');
      }
    });
  }

  ngOnInit(): void {
    this.themes$
      .pipe(
        filter((themes): themes is Theme[] => Array.isArray(themes) && themes.length > 0),
        take(1),
      )
      .subscribe((themes) => {
        const current = String(this.themesEditForm.get('titleUrl')?.value ?? '').trim();
        if (current) {
          return;
        }
        const active = themes.find((t) => t.active) ?? themes[0];
        if (active?.titleUrl) {
          this.chosenTheme = active.titleUrl;
          this.choseTheme();
        }
      });
  }

  /** URL usable en `<img>` para vista previa (logo / banner); null si es gradiente/CSS sin imagen. */
  imagePreviewSrc(controlName: 'logo' | 'promoSlideBackground'): string | null {
    const raw = String(this.themesEditForm?.get(controlName)?.value ?? '').trim();
    if (!raw) {
      return null;
    }
    const lower = raw.toLowerCase();
    if (
      lower.startsWith('linear-gradient') ||
      lower.startsWith('radial-gradient') ||
      /^#[0-9a-f]{3,8}$/i.test(raw) ||
      lower.startsWith('rgb(') ||
      lower.startsWith('rgba(') ||
      lower.startsWith('hsl')
    ) {
      return null;
    }
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/') || raw.startsWith('data:')) {
      return raw;
    }
    return null;
  }

  /** Sube a Firebase Storage (por defecto en API) y rellena el campo con la URL pública. */
  onThemeImageUpload(controlName: 'logo' | 'promoSlideBackground', event: Event): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const files = input.files;
    input.value = '';
    if (!files?.length) {
      return;
    }
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      return;
    }
    const upload$ = this.apiService.uploadImage({ fileToUpload: file, titleUrl: undefined });
    if (!upload$) {
      return;
    }
    upload$.pipe(take(1)).subscribe((result: { all?: string[]; error?: unknown }) => {
      if (result?.error) {
        return;
      }
      const url = result?.all?.length ? result.all[result.all.length - 1] : null;
      if (url) {
        this.themesEditForm.patchValue({ [controlName]: url });
      }
    });
  }

  addTheme(): void {
    if (this.newTheme) {
      this.themesEditForm.get('titleUrl').setValue(this.newTheme);
      const newForm = {
        titleUrl:  this.newTheme,
        ...this.startFormValues()
      }
      this.themesEditForm.setValue(newForm);
    }
  }

  choseTheme(): void {
    if (this.chosenTheme) {
      this.themesEditForm.get('titleUrl').setValue(this.chosenTheme);
      this.themes$.pipe(take(1)).subscribe((themes) => {
        const foundTheme = themes?.find((theme) => theme.titleUrl === this.chosenTheme);
        if (!foundTheme?.styles) {
          return;
        }
        const defaults = this.startFormValues();
        this.themesEditForm.get('active').setValue(!!foundTheme.active);
        this.themesEditForm.get('freeShippingPromo').setValue(foundTheme.styles.freeShippingPromo || 'none');
        this.themesEditForm.get('promoSlideBackground').setValue(foundTheme.styles.promoSlideBackground || '');
        this.themesEditForm.get('promoSlideVideo').setValue(foundTheme.styles.promoSlideVideo || '');
        this.themesEditForm.get('promoSlideBackgroundPosition').setValue(foundTheme.styles.promoSlideBackgroundPosition || '');
        this.themesEditForm.get('promo').setValue(foundTheme.styles.promo || 'none');
        this.themesEditForm
          .get('primaryColor')
          .setValue(this.normalizeHexColor(foundTheme.styles.primaryColor, defaults.primaryColor as string));
        this.themesEditForm
          .get('secondaryColor')
          .setValue(this.normalizeHexColor(foundTheme.styles.secondaryColor, defaults.secondaryColor as string));
        this.themesEditForm
          .get('backgroundColor')
          .setValue(this.normalizeHexColor(foundTheme.styles.backgroundColor, defaults.backgroundColor as string));
        this.themesEditForm.get('mainBackground').setValue(foundTheme.styles.mainBackground || '');
        this.themesEditForm.get('logo').setValue(foundTheme.styles.logo || '');
      });
    }
  }

  saveTheme(): void {
    const formValues = this.themesEditForm.value;
    const request = {
      titleUrl: formValues.titleUrl,
      active  : formValues.active,
      styles: {
        primaryColor: formValues.primaryColor,
        promoSlideBackground: formValues.promoSlideBackground,
        promoSlideVideo: formValues.promoSlideVideo || '',
        promoSlideBackgroundPosition: formValues.promoSlideBackgroundPosition,
        secondaryColor: formValues.secondaryColor,
        backgroundColor: formValues.backgroundColor,
        mainBackground: formValues.mainBackground,
        freeShippingPromo: formValues.freeShippingPromo,
        promo: formValues.promo,
        logo: formValues.logo
      }
    }
    this.store.addOrEditTheme(request);
    this.sendRequest = true;
  }

  removeTheme(): void {
    this.store.removeTheme(this.chosenTheme);
    this.sendRequest = true;
  }

  private startFormValues() {
    return {
      active  : false,
      freeShippingPromo: 'none',
      promoSlideBackground: '',
      promoSlideVideo: '',
      promoSlideBackgroundPosition: 'center',
      promo: 'none',
      primaryColor: '#222222',
      secondaryColor: '#cccccc',
      backgroundColor: '#eeeeee',
      mainBackground: '',
      logo: ''
    }
  }

  /** `input[type=color]` exige `#rrggbb`; temas viejos pueden traer vacío u otro formato. */
  private normalizeHexColor(value: string | undefined | null, fallback: string): string {
    const v = (value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      return v.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      const r = v[1];
      const g = v[2];
      const b = v[3];
      return (`#${r}${r}${g}${g}${b}${b}`).toLowerCase();
    }
    return fallback;
  }

}
