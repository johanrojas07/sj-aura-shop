import { isPlatformBrowser } from '@angular/common';
import { computed, Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import { Product } from '../shared/models';

export interface RecentProductSnapshot {
  titleUrl: string;
  title: string;
  imageUrl?: string;
  viewedAt: number;
}

const STORAGE_KEY = 'eshop_recent_products_v1';
const MAX_ITEMS = 14;

@Injectable({ providedIn: 'root' })
export class RecentProductsService {
  private readonly items = signal<RecentProductSnapshot[]>([]);

  /** Lista más reciente primero (solo lectura para plantillas). */
  readonly recent = this.items.asReadonly();

  readonly lastViewed = computed(() => this.items()[0] ?? null);

  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {
    if (isPlatformBrowser(this.platformId)) {
      this.items.set(this.readStorage());
    }
  }

  /** Registra una visita al PDP (idempotente por `titleUrl` en la misma sesión de carga). */
  recordView(product: Product | null | undefined): void {
    if (!isPlatformBrowser(this.platformId) || !product?.titleUrl) {
      return;
    }
    const snap: RecentProductSnapshot = {
      titleUrl: product.titleUrl,
      title: (product.title || product.titleUrl).trim(),
      imageUrl: product.mainImage?.url || undefined,
      viewedAt: Date.now(),
    };
    const rest = this.items().filter((x) => x.titleUrl !== snap.titleUrl);
    const next = [snap, ...rest].slice(0, MAX_ITEMS);
    this.items.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
  }

  private readStorage(): RecentProductSnapshot[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (x): x is RecentProductSnapshot =>
            !!x &&
            typeof x === 'object' &&
            typeof (x as RecentProductSnapshot).titleUrl === 'string' &&
            (x as RecentProductSnapshot).titleUrl.length > 0,
        )
        .map((x) => ({
          titleUrl: x.titleUrl,
          title: typeof x.title === 'string' ? x.title : x.titleUrl,
          imageUrl: typeof x.imageUrl === 'string' ? x.imageUrl : undefined,
          viewedAt: typeof x.viewedAt === 'number' ? x.viewedAt : 0,
        }))
        .slice(0, MAX_ITEMS);
    } catch {
      return [];
    }
  }
}
