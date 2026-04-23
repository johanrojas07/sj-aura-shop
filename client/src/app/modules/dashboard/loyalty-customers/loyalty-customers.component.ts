import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { ApiService } from '../../../services/api.service';
import { TranslateService } from '../../../services/translate.service';

export type LoyaltyCustomerRow = {
  ref: string;
  kind: 'registered' | 'guest';
  name: string | null;
  email: string | null;
  phoneMasked: string;
  points: number;
  lastActivityAt: number | null;
  mergedIntoUserId?: string;
};

@Component({
  selector: 'app-loyalty-customers',
  templateUrl: './loyalty-customers.component.html',
  styleUrls: ['./loyalty-customers.component.scss', '../_dash-admin-forms.shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class LoyaltyCustomersComponent {
  /** Idioma actual (una sola fuente; evita `async` pipe por fila en la tabla). */
  readonly dashboardLang = signal('');
  /** Fallback hasta el primer valor de `getLang$` (evita `routerLink` vacío). */
  readonly effectiveLang = computed(() => {
    const v = this.dashboardLang();
    return v && v.trim() ? v : 'es';
  });
  readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];

  readonly loyaltyTableColumns: string[] = [
    'kind',
    'name',
    'email',
    'phone',
    'points',
    'activity',
    'actions',
  ];

  loading = false;
  error: string | null = null;
  items: LoyaltyCustomerRow[] = [];
  total = 0;
  page = 1;
  pageSize = 15;
  scanMeta: {
    usersScanned: number;
    walletsScanned: number;
    auditsScanned: number;
    capped: boolean;
  } | null = null;

  q = '';
  typeFilter: 'all' | 'registered' | 'guest' = 'all';
  sort: 'points_desc' | 'points_asc' | 'name_asc' | 'activity_desc' =
    'points_desc';
  minPoints = '';
  maxPoints = '';

  private readonly destroyRef = inject(DestroyRef);
  private loadRequestId = 0;

  constructor(
    public readonly translate: TranslateService,
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.translate
      .getLang$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lang) => {
        this.dashboardLang.set(lang);
        this.cdr.markForCheck();
      });
    this.load();
  }

  load(): void {
    const requestId = ++this.loadRequestId;
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    const minP = this.minPoints.trim() === '' ? undefined : Number(this.minPoints);
    const maxP = this.maxPoints.trim() === '' ? undefined : Number(this.maxPoints);
    this.api
      .listAdminLoyaltyCustomers({
        page: this.page,
        pageSize: this.pageSize,
        sort: this.sort,
        type: this.typeFilter,
        q: this.q.trim() || undefined,
        minPoints: Number.isFinite(minP as number) ? (minP as number) : undefined,
        maxPoints: Number.isFinite(maxP as number) ? (maxP as number) : undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestId === this.loadRequestId) {
            this.loading = false;
            this.cdr.markForCheck();
          }
        }),
      )
      .subscribe((res: any) => {
        if (requestId !== this.loadRequestId) {
          return;
        }
        if (res?.error) {
          this.error = 'DASH_LOYALTY_ERR_LOAD';
          this.items = [];
          this.total = 0;
          this.scanMeta = null;
          return;
        }
        this.error = null;
        this.items = Array.isArray(res?.items) ? res.items : [];
        this.total = typeof res?.total === 'number' ? res.total : 0;
        this.scanMeta = res?.scanMeta ?? null;
      });
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page -= 1;
      this.load();
    }
  }

  nextPage(): void {
    if (this.page * this.pageSize < this.total) {
      this.page += 1;
      this.load();
    }
  }

  detailQuery(ref: string): { ref: string } {
    return { ref };
  }

  formatActivity(ts: number | null): string {
    if (!ts) {
      return '—';
    }
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '—';
    }
  }
}
