import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { SITE_TIKTOK_URL, siteWhatsAppChatUrl } from '../../site-media.defaults';
import { TranslatePipe } from '../../../pipes/translate.pipe';

@Component({
  selector: 'app-whatsapp-fab',
  templateUrl: './whatsapp-fab.component.html',
  styleUrls: ['./whatsapp-fab.component.scss'],
  imports: [CommonModule, TranslatePipe],
})
export class WhatsappFabComponent {
  private readonly router = inject(Router);
  private readonly wa = siteWhatsAppChatUrl();
  /** @tefasg4 (configuración central). */
  readonly tiktokUrl = SITE_TIKTOK_URL;

  private readonly isOnDashboard = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => isDashboardPath(this.router.url)),
      startWith(isDashboardPath(this.router.url)),
    ),
    { initialValue: isDashboardPath(this.router.url) },
  );

  /** Cinta de redes en tienda (oculta en back-office). */
  readonly showSocialRail = computed(() => !this.isOnDashboard()!);

  /** Número configurado = botón de WhatsApp. */
  readonly showWhatsapp = computed(() => this.wa !== null);

  readonly href = this.wa ?? '#';
}

function isDashboardPath(url: string): boolean {
  return /\/dashboard(\/|$)/.test((url || '').split('?')[0].toLowerCase());
}
