import { Injectable, signal, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ProductQuickViewService {
  private readonly _open = signal(false);
  private readonly _titleUrl = signal<string | null>(null);

  readonly isOpen = this._open.asReadonly();
  readonly titleUrl = this._titleUrl.asReadonly();

  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  /** Abre la vista rápida para un slug `titleUrl` (sin navegar). */
  open(slug: string): void {
    const s = (slug || '').trim();
    if (!s) {
      return;
    }
    this._titleUrl.set(s);
    this._open.set(true);
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = 'hidden';
    }
  }

  close(): void {
    this._open.set(false);
    this._titleUrl.set(null);
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }
}
