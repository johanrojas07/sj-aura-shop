import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  merge,
  of,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { ApiService } from '../../../services/api.service';
import { TranslateService } from '../../../services/translate.service';
import type { LoyaltyCustomerRow } from '../loyalty-customers/loyalty-customers.component';

const COP_PER_POINT = 1000;

/** Respuesta de `GET .../loyalty/customers/lookup-phone` */
export interface PhoneLookupResult {
  valid: boolean;
  found: boolean;
  kind: 'registered' | 'guest' | 'new';
  name: string | null;
  email: string | null;
  points: number;
  ref: string | null;
  phoneMasked: string;
}

function minPurchasePointsValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const n = Math.floor(Number(String(control.value ?? '').replace(/\s/g, '')));
    if (!Number.isFinite(n) || n < 1) {
      return null;
    }
    return Math.floor(n / COP_PER_POINT) < 1 ? { lowPurchase: true } : null;
  };
}

@Component({
  selector: 'app-loyalty-manual-purchase',
  templateUrl: './loyalty-manual-purchase.component.html',
  styleUrls: ['./loyalty-manual-purchase.component.scss', '../_dash-admin-forms.shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class LoyaltyManualPurchaseComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();
  private readonly phoneBlur$ = new Subject<string>();

  readonly dashboardLang = signal('');
  readonly effectiveLang = computed(() => {
    const v = this.dashboardLang();
    return v?.trim() ? v : 'es';
  });

  readonly form = this.fb.group({
    phone: ['', [Validators.required, Validators.minLength(8)]],
    displayName: [''],
    amountCop: [
      '',
      [Validators.required, Validators.pattern(/^[0-9]+$/), minPurchasePointsValidator()],
    ],
    note: [''],
    confirm: this.fb.control(false, { validators: Validators.requiredTrue }),
  });

  searchQuery = '';
  searchItems: LoyaltyCustomerRow[] = [];
  searchLoading = false;

  selectedRef: string | null = null;
  /** Saldo al elegir cliente en el buscador (para total aprox. en la vista previa). */
  selectedPoints: number | null = null;
  selectedLabel = '';

  busy = false;
  /** Clave i18n para banner bajo el formulario (éxito / error API). */
  bannerKey: string | null = null;
  bannerType: 'success' | 'error' = 'success';

  /** Vista previa por teléfono (compra manual sin cliente del buscador). */
  phoneLookup: PhoneLookupResult | null = null;
  phoneLookupLoading = false;
  phoneLookupError = false;

  constructor(
    public readonly translate: TranslateService,
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.translate
      .getLang$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lang) => {
        this.dashboardLang.set(lang);
        this.cdr.markForCheck();
      });
    this.translate.translationsSub$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
  }

  ngOnInit(): void {
    this.applyPhoneValidatorsForSelection();
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.cdr.markForCheck();
    });
    this.wirePhoneLookup();
    this.search$
      .pipe(
        debounceTime(400),
        map((v) => v.trim()),
        distinctUntilChanged(),
        tap((q) => {
          if (q.length < 2) {
            this.searchLoading = false;
            this.searchItems = [];
          } else {
            this.searchLoading = true;
          }
          this.cdr.markForCheck();
        }),
        switchMap((q) => {
          if (q.length < 2) {
            return of({ items: [] as LoyaltyCustomerRow[] });
          }
          return this.api.listAdminLoyaltyCustomers({
            q,
            pageSize: 12,
            page: 1,
            type: 'all',
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => {
        this.searchLoading = false;
        if (res?.error) {
          this.searchItems = [];
        } else {
          this.searchItems = Array.isArray(res?.items) ? res.items : [];
        }
        this.cdr.markForCheck();
      });
  }

  previewPoints(): number {
    const raw = this.form.controls.amountCop.value;
    const n = Math.floor(Number(String(raw).replace(/\s/g, '')));
    if (!Number.isFinite(n) || n < 1) {
      return 0;
    }
    return Math.floor(n / COP_PER_POINT);
  }

  /** Sustitución simple `{var}` en cadenas i18n. */
  /** Texto de ayuda bajo el nombre según búsqueda / teléfono / reglas de backend. */
  nameFieldHintKey(): string {
    if (this.selectedRef) {
      return 'DASH_LOYALTY_MANUAL_NAME_HINT_PICKED';
    }
    if (
      this.phoneLookup &&
      this.phoneLookup.valid &&
      this.phoneLookup.found &&
      (this.phoneLookup.name ?? '').trim()
    ) {
      return 'DASH_LOYALTY_MANUAL_NAME_HINT_FROM_PHONE';
    }
    return 'DASH_LOYALTY_MANUAL_NAME_HINT_OPTIONAL';
  }

  tr(key: string, vars: Record<string, string | number> = {}): string {
    const map = this.translate.translationsSub$.getValue();
    let s = (map && map[key]) || key;
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
    return s;
  }

  /** Puntos aproximados tras registrar (cliente del buscador o teléfono con lookup). */
  totalPointsAfterHint(): { current: number; add: number; total: number } | null {
    const add = this.previewPoints();
    if (add < 1) {
      return null;
    }
    if (this.selectedRef && this.selectedPoints != null) {
      const current = Math.max(0, Math.floor(this.selectedPoints));
      return { current, add, total: current + add };
    }
    if (!this.selectedRef && this.phoneLookup?.found) {
      const current = Math.max(0, Math.floor(this.phoneLookup.points));
      return { current, add, total: current + add };
    }
    return null;
  }

  /**
   * El `displayName` en backend solo aplica a invitados; si el perfil ya trae nombre (lookup
   * o búsqueda) no hace falta reescribir. Deshabilita el control cuando aplica.
   */
  private syncDisplayNameToContext(): void {
    const c = this.form.controls.displayName;
    if (this.selectedRef) {
      c.setValue('', { emitEvent: false });
      c.disable({ emitEvent: false });
      return;
    }
    const p = this.phoneLookup;
    if (p && p.valid && p.found && p.name && String(p.name).trim().length) {
      c.setValue(String(p.name).trim(), { emitEvent: false });
      c.disable({ emitEvent: false });
      return;
    }
    const wasLocked = c.disabled;
    c.enable({ emitEvent: false });
    if (wasLocked) {
      c.setValue('', { emitEvent: false });
    }
  }

  onPhoneBlur(): void {
    const raw = String(this.form.getRawValue().phone ?? '').trim();
    this.phoneBlur$.next(raw);
  }

  private wirePhoneLookup(): void {
    merge(
      this.form.controls.phone.valueChanges.pipe(
        debounceTime(450),
        distinctUntilChanged(),
      ),
      this.phoneBlur$,
    )
      .pipe(
        filter(() => !this.selectedRef),
        filter(() => this.form.controls.phone.enabled),
        switchMap((phone) => {
          const raw = String(phone ?? '').trim();
          const d = raw.replace(/\D/g, '');
          if (d.length < 8) {
            this.phoneLookupLoading = false;
            this.phoneLookupError = false;
            this.phoneLookup = null;
            this.syncDisplayNameToContext();
            this.cdr.markForCheck();
            return of(null);
          }
          this.phoneLookupLoading = true;
          this.phoneLookupError = false;
          this.cdr.markForCheck();
          return this.api.getAdminLoyaltyLookupPhone(raw).pipe(
            map((res: unknown) => {
              if (res && typeof res === 'object' && 'error' in res && (res as { error: unknown }).error) {
                return { err: true as const };
              }
              return { data: res as PhoneLookupResult };
            }),
            catchError(() => of({ err: true as const })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((box) => {
        this.phoneLookupLoading = false;
        if (box == null) {
          this.cdr.markForCheck();
          return;
        }
        if ('err' in box && box.err) {
          this.phoneLookup = null;
          this.phoneLookupError = true;
          this.syncDisplayNameToContext();
          this.cdr.markForCheck();
          return;
        }
        this.phoneLookupError = false;
        this.phoneLookup =
          'data' in box && box.data != null
            ? box.data
            : null;
        this.syncDisplayNameToContext();
        this.cdr.markForCheck();
      });
  }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.search$.next(value);
  }

  private applyPhoneValidatorsForSelection(): void {
    const phone = this.form.controls.phone;
    if (this.selectedRef) {
      phone.clearValidators();
    } else {
      phone.setValidators([Validators.required, Validators.minLength(8)]);
    }
    phone.updateValueAndValidity({ emitEvent: false });
  }

  pickCustomer(row: LoyaltyCustomerRow): void {
    this.selectedRef = row.ref;
    this.selectedPoints = Math.max(0, Math.floor(Number(row.points) || 0));
    const bits = [row.name, row.email, row.phoneMasked].filter(Boolean).join(' · ');
    this.selectedLabel = bits || row.ref;
    this.searchItems = [];
    this.searchQuery = '';
    this.phoneLookup = null;
    this.phoneLookupError = false;
    this.phoneLookupLoading = false;
    this.form.controls.phone.reset('');
    this.form.controls.phone.disable({ emitEvent: false });
    this.applyPhoneValidatorsForSelection();
    this.syncDisplayNameToContext();
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedRef = null;
    this.selectedLabel = '';
    this.selectedPoints = null;
    this.phoneLookup = null;
    this.phoneLookupError = false;
    this.form.controls.phone.enable({ emitEvent: false });
    this.applyPhoneValidatorsForSelection();
    this.syncDisplayNameToContext();
    const raw = String(this.form.getRawValue().phone ?? '').trim();
    if (raw.replace(/\D/g, '').length >= 8) {
      this.onPhoneBlur();
    }
    this.cdr.markForCheck();
  }

  back(): void {
    void this.router.navigate(['/', this.effectiveLang(), 'dashboard', 'loyalty']);
  }

  submit(): void {
    this.bannerKey = null;
    this.applyPhoneValidatorsForSelection();
    this.form.controls.amountCop.updateValueAndValidity({ emitEvent: false });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }

    const amountCOP = Math.floor(Number(this.form.controls.amountCop.value));
    const body: Record<string, unknown> = { amountCOP };
    if (!this.selectedRef) {
      const dn = this.form.controls.displayName;
      if (dn.enabled) {
        const t = (dn.value ?? '').trim();
        if (t) {
          body.displayName = t;
        }
      }
    }
    const nt = this.form.controls.note.value.trim();
    if (nt) {
      body.note = nt;
    }
    if (this.selectedRef) {
      body.targetRef = this.selectedRef;
    } else {
      body.phone = this.form.getRawValue().phone.trim();
    }

    this.busy = true;
    this.cdr.markForCheck();
    this.api
      .adminLoyaltyManualPurchase(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res: any) => {
      this.busy = false;
      if (res?.error) {
        this.bannerType = 'error';
        this.bannerKey = 'DASH_LOYALTY_MANUAL_ERR_API';
        this.cdr.markForCheck();
        return;
      }
      this.bannerType = 'success';
      this.bannerKey = 'DASH_LOYALTY_MANUAL_OK';
      this.form.reset({ phone: '', displayName: '', amountCop: '', note: '', confirm: false });
      this.clearSelection();
      this.cdr.markForCheck();
      const cref = typeof res?.customerRef === 'string' ? res.customerRef : '';
      if (cref) {
        this.langRouteOnce().subscribe((lang) => {
          void this.router.navigate(['/', lang, 'dashboard', 'loyalty', 'detail'], {
            queryParams: { ref: cref },
          });
        });
      }
    });
  }

  private langRouteOnce() {
    return this.translate.getLang$().pipe(take(1));
  }
}
