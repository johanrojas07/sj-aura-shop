import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartDrawerService {
  private readonly _open = signal(false);

  readonly isOpen = this._open.asReadonly();

  open(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update((v) => !v);
  }

  /** Sincroniza con `openedChange` del MatSidenav (backdrop, swipe). */
  syncOpen(open: boolean): void {
    this._open.set(open);
  }
}
