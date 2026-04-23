import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { ApiService } from '../../../services/api.service';
import { TranslateService } from '../../../services/translate.service';
import type { LoyaltyCustomerRow } from '../loyalty-customers/loyalty-customers.component';

/** Cuerpo que devuelve `ApiService` vía `catchError` (no el JSON 200 de Nest). */
function isLoyaltyApiErrorPayload(m: unknown): boolean {
  return (
    m != null &&
    typeof m === 'object' &&
    'error' in m &&
    Boolean((m as { error: unknown }).error)
  );
}

@Component({
  selector: 'app-loyalty-customer-detail',
  templateUrl: './loyalty-customer-detail.component.html',
  styleUrls: ['./loyalty-customer-detail.component.scss', '../_dash-admin-forms.shared.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoyaltyCustomerDetailComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  lang$: Observable<string>;

  ref = '';
  loading = true;
  error: string | null = null;
  detail: any = null;

  /** Suma o resta — el delta se envía como +n o −n. */
  adjustMode: 'add' | 'subtract' = 'add';
  adjustAmount = '';
  adjustReason = '';
  adjustBusy = false;
  adjustMsg: string | null = null;
  /** Mensaje del servidor (si no hay clave de i18n). */
  adjustErrorDetail: string | null = null;

  xferAmount = '';
  xferReason = '';
  xferToType: 'user' | 'phone_wallet' = 'user';
  xferToUserId = '';
  xferToPhone = '';
  xferToPhoneHash = '';
  xferBusy = false;
  xferMsg: string | null = null;
  xferErrorDetail: string | null = null;
  /** Búsqueda de cliente destino (misma API que en compra manual). */
  private readonly xferSearch$ = new Subject<string>();
  xferSearchQuery = '';
  xferSearchItems: LoyaltyCustomerRow[] = [];
  xferSearchLoading = false;
  /** Cliente elegido en el buscador: rellena toUserId / toPhoneHash. */
  xferDestPicked: LoyaltyCustomerRow | null = null;

  constructor(
    public readonly translate: TranslateService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: ApiService,
  ) {
    this.lang$ = this.translate.getLang$();
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(
        map((pm) => (pm.get('ref') || '').trim()),
        distinctUntilChanged(),
        switchMap((r) => {
          this.ref = r;
          if (!r) {
            this.loading = false;
            this.error = 'DASH_LOYALTY_ERR_NO_REF';
            this.detail = null;
            this.cdr.markForCheck();
            return of({ _noRef: true } as const);
          }
          this.loading = true;
          this.error = null;
          this.detail = null;
          this.cdr.markForCheck();
          return this.api.getAdminLoyaltyCustomerDetail(r).pipe(
            map((res: any) => ({ res } as const)),
            catchError(() => of({ res: { error: true } } as const)),
            finalize(() => {
              this.loading = false;
              this.cdr.markForCheck();
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((out) => {
        if (out && '_noRef' in out) {
          return;
        }
        const res = (out as { res: any })?.res;
        if (isLoyaltyApiErrorPayload(res)) {
          this.error = 'DASH_LOYALTY_ERR_DETAIL';
          this.detail = null;
          this.cdr.markForCheck();
          return;
        }
        this.error = null;
        this.detail = res;
        this.cdr.markForCheck();
      });

    this.xferSearch$
      .pipe(
        debounceTime(400),
        map((v) => (v || '').trim()),
        distinctUntilChanged(),
        tap((q) => {
          if (q.length < 2) {
            this.xferSearchLoading = false;
            this.xferSearchItems = [];
            this.cdr.markForCheck();
          } else {
            this.xferSearchLoading = true;
            this.cdr.markForCheck();
          }
        }),
        switchMap((q) => {
          if (q.length < 2) {
            return of({ items: [] as LoyaltyCustomerRow[] });
          }
          return this.api.listAdminLoyaltyCustomers({
            q,
            pageSize: 10,
            page: 1,
            type: 'all',
            sort: 'points_desc',
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => {
        this.xferSearchLoading = false;
        if (res?.error) {
          this.xferSearchItems = [];
        } else {
          this.xferSearchItems = Array.isArray(res?.items) ? res.items : [];
        }
        this.cdr.markForCheck();
      });
  }

  onXferSearchInput(value: string): void {
    this.xferSearchQuery = value;
    this.xferSearch$.next(value);
  }

  onXferAmountChange(): void {
    this.xferMsg = null;
    this.xferErrorDetail = null;
  }

  pickXferDest(row: LoyaltyCustomerRow): void {
    if (row.ref === this.ref) {
      this.xferMsg = 'DASH_LOYALTY_XFER_ERR_SELF';
      this.xferErrorDetail = null;
      this.cdr.markForCheck();
      return;
    }
    this.xferMsg = null;
    this.xferErrorDetail = null;
    this.xferDestPicked = row;
    this.xferSearchItems = [];
    this.xferSearchQuery = '';
    if (row.ref.startsWith('user|')) {
      this.xferToType = 'user';
      this.xferToUserId = row.ref.slice(5).trim();
      this.xferToPhone = '';
      this.xferToPhoneHash = '';
    } else if (row.ref.toLowerCase().startsWith('guest|')) {
      this.xferToType = 'phone_wallet';
      this.xferToPhoneHash = row.ref.slice(6).trim();
      this.xferToUserId = '';
      this.xferToPhone = '';
    }
    this.cdr.markForCheck();
  }

  clearXferDest(): void {
    this.xferDestPicked = null;
    this.xferToUserId = '';
    this.xferToPhone = '';
    this.xferToPhoneHash = '';
    this.cdr.markForCheck();
  }

  onXferDestManualInput(): void {
    this.xferDestPicked = null;
  }

  onXferToTypeChange(): void {
    this.xferDestPicked = null;
  }

  /** Puntos actuales del cliente en pantalla. */
  get availablePoints(): number {
    return Math.max(0, Math.floor(Number(this.detail?.points) || 0));
  }

  get xferAmountInt(): number {
    return Math.floor(Number(this.xferAmount));
  }

  /** true si el monto supera el saldo o es inválido. */
  get xferExceedsBalance(): boolean {
    const a = this.xferAmountInt;
    return Number.isFinite(a) && a > 0 && a > this.availablePoints;
  }

  get adjustAmountInt(): number {
    return Math.floor(Number(this.adjustAmount));
  }

  get adjustDeltaPlanned(): number {
    const n = this.adjustAmountInt;
    if (!Number.isFinite(n) || n <= 0) {
      return 0;
    }
    return this.adjustMode === 'add' ? n : -n;
  }

  get adjustPreviewNewTotal(): number {
    if (!this.detail) {
      return 0;
    }
    return this.availablePoints + (this.adjustDeltaPlanned || 0);
  }

  get adjustWouldGoNegative(): boolean {
    if (!this.detail || this.adjustDeltaPlanned === 0) {
      return false;
    }
    return this.adjustPreviewNewTotal < 0;
  }

  private resolveFromUserIdForTransfer(): string | undefined {
    if (this.detail?.kind !== 'registered') {
      return undefined;
    }
    const r = (this.ref && this.ref.startsWith('user|') ? this.ref : this.detail?.ref) || '';
    if (r.startsWith('user|')) {
      return r.slice(5).trim() || undefined;
    }
    return undefined;
  }

  private static extractApiErrorMessage(err: unknown): string | null {
    const o = err as { error?: { message?: string | string[] } | string; message?: string };
    const body = o?.error;
    if (typeof body === 'string' && body.trim()) {
      return body.trim();
    }
    if (body && typeof body === 'object' && 'message' in body) {
      const m = (body as { message: string | string[] }).message;
      if (Array.isArray(m) && m[0]) {
        return String(m[0]);
      }
      if (typeof m === 'string' && m) {
        return m;
      }
    }
    if (typeof o?.message === 'string' && o.message) {
      return o.message;
    }
    return null;
  }

  private mapTransferErrorKey(err: unknown): { key: string; raw: string | null } {
    const raw = LoyaltyCustomerDetailComponent.extractApiErrorMessage(err);
    if (raw === 'INSUFFICIENT_BALANCE' || (raw && /insuficiente|INSUFFICIENT_BALANCE/i.test(raw))) {
      return { key: 'DASH_LOYALTY_XFER_ERR_INSUFFICIENT', raw: null };
    }
    if (raw && (raw.includes('mismo') || /same|Origen y destino/i.test(raw))) {
      return { key: 'DASH_LOYALTY_XFER_ERR_SELF', raw: null };
    }
    if (raw && raw.length < 200) {
      return { key: 'DASH_LOYALTY_XFER_ERR_API', raw };
    }
    return { key: 'DASH_LOYALTY_XFER_ERR_API', raw: null };
  }

  private mapAdjustErrorKey(err: unknown): { key: string; raw: string | null } {
    const raw = LoyaltyCustomerDetailComponent.extractApiErrorMessage(err);
    if (raw && /negativo|dejaría saldo negativo|Wallet inexistente|negative balance/i.test(raw)) {
      return { key: 'DASH_LOYALTY_ADJUST_ERR_NEGATIVE', raw: null };
    }
    if (raw && /no puede ser cero|cannot be zero|no puede ser cero/i.test(raw)) {
      return { key: 'DASH_LOYALTY_ADJUST_ERR_DELTA', raw: null };
    }
    return { key: 'DASH_LOYALTY_ADJUST_ERR_API', raw: raw && raw.length < 200 ? raw : null };
  }

  fetch(): void {
    this.loading = true;
    this.error = null;
    this.detail = null;
    this.cdr.markForCheck();
    this.api
      .getAdminLoyaltyCustomerDetail(this.ref)
      .pipe(
        catchError(() => of({ error: true } as const)),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res: any) => {
        if (isLoyaltyApiErrorPayload(res)) {
          this.error = 'DASH_LOYALTY_ERR_DETAIL';
          this.detail = null;
          this.cdr.markForCheck();
          return;
        }
        this.error = null;
        this.detail = res;
        this.cdr.markForCheck();
      });
  }

  back(lang: string): void {
    void this.router.navigate(['/', lang, 'dashboard', 'loyalty']);
  }

  orderDashUrl(lang: string, orderId: string): string[] {
    return ['/', lang, 'dashboard', 'orders', orderId];
  }

  auditClass(type: string): string {
    const t = (type || '').toUpperCase();
    if (t.includes('REDEEM')) {
      return 'dash-loyalty-detail__mov--out';
    }
    if (
      t.includes('ORDER') ||
      t.includes('MERGE') ||
      t.includes('ADJUST') ||
      t.includes('MANUAL')
    ) {
      if (t.includes('ADJUST')) {
        return 'dash-loyalty-detail__mov--adj';
      }
      return 'dash-loyalty-detail__mov--in';
    }
    if (t.includes('TRANSFER')) {
      return 'dash-loyalty-detail__mov--xfer';
    }
    return '';
  }

  /** Fila de tabla: transferencias toman in/out según el signo mostrado; ajustes según `delta` real. */
  auditRowClass(a: {
    type: string;
    delta?: number;
    transferFromUserId?: string;
    transferToUserId?: string;
    transferFromPhoneHash?: string;
    transferToPhoneHash?: string;
  }): string {
    const t = (a.type || '').toUpperCase();
    if (t === 'ADMIN_TRANSFER') {
      const d = this.auditDisplayDelta(a);
      if (d < 0) {
        return 'dash-loyalty-detail__mov--out';
      }
      if (d > 0) {
        return 'dash-loyalty-detail__mov--in';
      }
    }
    if (t === 'ADMIN_ADJUST') {
      const d = a.delta ?? 0;
      if (d < 0) {
        return 'dash-loyalty-detail__mov--out';
      }
      if (d > 0) {
        return 'dash-loyalty-detail__mov--in';
      }
      return 'dash-loyalty-detail__mov--adj';
    }
    return this.auditClass(a.type);
  }

  submitAdjust(): void {
    this.adjustMsg = null;
    this.adjustErrorDetail = null;
    const n = this.adjustAmountInt;
    if (!Number.isFinite(n) || n <= 0) {
      this.adjustMsg = 'DASH_LOYALTY_ADJUST_ERR_AMOUNT';
      this.cdr.markForCheck();
      return;
    }
    const delta = this.adjustMode === 'add' ? n : -n;
    if (this.adjustWouldGoNegative) {
      this.adjustMsg = 'DASH_LOYALTY_ADJUST_ERR_NEGATIVE';
      this.cdr.markForCheck();
      return;
    }
    const reason = this.adjustReason.trim();
    if (reason.length < 3) {
      this.adjustMsg = 'DASH_LOYALTY_ERR_REASON';
      this.cdr.markForCheck();
      return;
    }
    const kind = this.detail?.kind;
    const body: Record<string, unknown> = {
      targetType: kind === 'registered' ? 'user' : 'phone_wallet',
      delta,
      reason,
    };
    if (kind === 'registered') {
      const uid = this.resolveFromUserIdForTransfer() || (this.ref.startsWith('user|') ? this.ref.slice(5) : '');
      if (!uid) {
        this.adjustMsg = 'DASH_LOYALTY_ADJUST_ERR_API';
        this.cdr.markForCheck();
        return;
      }
      body.targetUserId = uid;
    } else {
      body.targetPhoneHash = this.detail?.walletHash || '';
    }
    this.adjustBusy = true;
    this.cdr.markForCheck();
    this.api.adminLoyaltyAdjust(body).subscribe((res: any) => {
      this.adjustBusy = false;
      if (res?.error) {
        const m = this.mapAdjustErrorKey(res.error);
        this.adjustMsg = m.key;
        this.adjustErrorDetail = m.raw;
        this.cdr.markForCheck();
        return;
      }
      this.adjustAmount = '';
      this.adjustReason = '';
      this.adjustMode = 'add';
      this.adjustMsg = 'DASH_LOYALTY_ADJUST_OK';
      this.fetch();
    });
  }

  submitTransfer(): void {
    this.xferMsg = null;
    this.xferErrorDetail = null;
    const amount = this.xferAmountInt;
    if (!Number.isFinite(amount) || amount <= 0) {
      this.xferMsg = 'DASH_LOYALTY_XFER_ERR_AMOUNT';
      this.cdr.markForCheck();
      return;
    }
    if (amount > this.availablePoints) {
      this.xferMsg = 'DASH_LOYALTY_XFER_ERR_INSUFFICIENT';
      this.cdr.markForCheck();
      return;
    }
    const reason = this.xferReason.trim();
    if (reason.length < 3) {
      this.xferMsg = 'DASH_LOYALTY_ERR_REASON';
      this.cdr.markForCheck();
      return;
    }
    const kind = this.detail?.kind;
    const fromType = kind === 'registered' ? 'user' : 'phone_wallet';
    const fromUserId = kind === 'registered' ? this.resolveFromUserIdForTransfer() : undefined;
    const fromPhoneHash =
      kind === 'guest' ? (this.detail?.walletHash as string) : undefined;

    const body: Record<string, unknown> = {
      fromType,
      toType: this.xferToType,
      amount,
      reason,
    };
    if (fromType === 'user') {
      if (!fromUserId) {
        this.xferMsg = 'DASH_LOYALTY_XFER_ERR_FROM';
        this.cdr.markForCheck();
        return;
      }
      body.fromUserId = fromUserId;
    } else {
      if (!fromPhoneHash) {
        this.xferMsg = 'DASH_LOYALTY_XFER_ERR_FROM';
        this.cdr.markForCheck();
        return;
      }
      body.fromPhoneHash = fromPhoneHash;
    }
    if (this.xferToType === 'user') {
      const toUid = this.xferToUserId.trim();
      if (!toUid) {
        this.xferMsg = 'DASH_LOYALTY_XFER_ERR_TO';
        this.cdr.markForCheck();
        return;
      }
      if (fromType === 'user' && fromUserId && toUid === fromUserId) {
        this.xferMsg = 'DASH_LOYALTY_XFER_ERR_SELF';
        this.cdr.markForCheck();
        return;
      }
      body.toUserId = toUid;
    } else {
      const th = this.xferToPhoneHash.trim();
      if (th.length === 64 && /^[a-f0-9]+$/i.test(th)) {
        const thl = th.toLowerCase();
        if (
          fromType === 'phone_wallet' &&
          fromPhoneHash &&
          thl === fromPhoneHash.toLowerCase()
        ) {
          this.xferMsg = 'DASH_LOYALTY_XFER_ERR_SELF';
          this.cdr.markForCheck();
          return;
        }
        body.toPhoneHash = thl;
      } else if (this.xferToPhone.trim()) {
        body.toPhone = this.xferToPhone.trim();
      } else {
        this.xferMsg = 'DASH_LOYALTY_XFER_ERR_TO';
        this.cdr.markForCheck();
        return;
      }
    }

    this.xferBusy = true;
    this.cdr.markForCheck();
    this.api.adminLoyaltyTransfer(body).subscribe((res: any) => {
      this.xferBusy = false;
      if (res?.error) {
        const m = this.mapTransferErrorKey(res.error);
        this.xferMsg = m.key;
        this.xferErrorDetail = m.raw;
        this.cdr.markForCheck();
        return;
      }
      this.xferAmount = '';
      this.xferReason = '';
      this.xferToUserId = '';
      this.xferToPhone = '';
      this.xferToPhoneHash = '';
      this.xferDestPicked = null;
      this.xferSearchQuery = '';
      this.xferSearchItems = [];
      this.xferMsg = 'DASH_LOYALTY_XFER_OK';
      this.fetch();
    });
  }

  /**
   * En el historial, `ADMIN_TRANSFER` se guarda una sola vez con delta positivo;
   * el signo correcto para quien mira (origen vs destino) se deduce con la ref del detalle.
   */
  auditDisplayDelta(a: {
    type: string;
    delta?: number;
    transferFromUserId?: string;
    transferToUserId?: string;
    transferFromPhoneHash?: string;
    transferToPhoneHash?: string;
  }): number {
    const raw = a.delta ?? 0;
    if (a.type !== 'ADMIN_TRANSFER' || !this.detail?.ref) {
      return raw;
    }
    const r = String(this.detail.ref);
    if (r.startsWith('user|')) {
      const uid = r.slice(5);
      if (a.transferFromUserId?.trim() === uid) {
        return -Math.abs(raw);
      }
      if (a.transferToUserId?.trim() === uid) {
        return Math.abs(raw);
      }
      return raw;
    }
    if (r.startsWith('guest|')) {
      const h = r.slice(6).toLowerCase();
      if (a.transferFromPhoneHash?.toLowerCase() === h) {
        return -Math.abs(raw);
      }
      if (a.transferToPhoneHash?.toLowerCase() === h) {
        return Math.abs(raw);
      }
    }
    return raw;
  }

  auditLabelKey(type: string): string {
    const map: Record<string, string> = {
      ORDER_COMPLETED_USER: 'DASH_LOYALTY_AUDIT_ORDER_USER',
      ORDER_COMPLETED_GUEST: 'DASH_LOYALTY_AUDIT_ORDER_GUEST',
      MERGE_GUEST_INTO_USER: 'DASH_LOYALTY_AUDIT_MERGE',
      REDEEM_USER: 'DASH_LOYALTY_AUDIT_REDEEM_USER',
      REDEEM_GUEST: 'DASH_LOYALTY_AUDIT_REDEEM_GUEST',
      ADMIN_ADJUST: 'DASH_LOYALTY_AUDIT_ADMIN_ADJ',
      ADMIN_TRANSFER: 'DASH_LOYALTY_AUDIT_ADMIN_XFER',
      MANUAL_PURCHASE: 'DASH_LOYALTY_AUDIT_MANUAL_PURCHASE',
    };
    return map[type] || 'DASH_LOYALTY_AUDIT_OTHER';
  }

  /** Clases de color en el ledger; `points` desambigua transferencias y ajustes. */
  txClass(type: string, points?: number): string {
    const t = (type || '').toUpperCase();
    const p = points ?? 0;
    if (t.includes('REDEEM')) {
      return 'dash-loyalty-detail__mov--out';
    }
    if (t.includes('TRANSFER')) {
      if (p < 0) {
        return 'dash-loyalty-detail__mov--out';
      }
      if (p > 0) {
        return 'dash-loyalty-detail__mov--in';
      }
      return 'dash-loyalty-detail__mov--xfer';
    }
    if (t.includes('ADJUST')) {
      if (p < 0) {
        return 'dash-loyalty-detail__mov--out';
      }
      if (p > 0) {
        return 'dash-loyalty-detail__mov--in';
      }
      return 'dash-loyalty-detail__mov--adj';
    }
    if (t.includes('MANUAL') || t.includes('ORDER') || t.includes('MERGE')) {
      return 'dash-loyalty-detail__mov--in';
    }
    return '';
  }

  txLabelKey(type: string): string {
    const map: Record<string, string> = {
      MANUAL_PURCHASE: 'DASH_LOYALTY_TX_MANUAL',
      ORDER_COMPLETED: 'DASH_LOYALTY_TX_ORDER',
      MERGE: 'DASH_LOYALTY_TX_MERGE',
      REDEEM: 'DASH_LOYALTY_TX_REDEEM',
      ADMIN_ADJUST: 'DASH_LOYALTY_TX_ADMIN_ADJ',
      ADMIN_TRANSFER: 'DASH_LOYALTY_TX_ADMIN_XFER',
    };
    return map[type] || 'DASH_LOYALTY_TX_OTHER';
  }
}
