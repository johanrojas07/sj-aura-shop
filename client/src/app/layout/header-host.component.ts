import { CommonModule, NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  signal,
  Type,
} from '@angular/core';

import type { HeaderComponent } from '../shared/components/header/header.component';

/**
 * Host de layout: monta el header real **solo en el cliente** mediante `import()` dinámico.
 *
 * Por qué existe:
 * - En SSR (Vite + dependencias: store, Firebase, Material, pipes), el orden de evaluación de
 *   módulos puede dejar una clase de DI como `undefined` al crear el factory del header →
 *   `ASSERTION ERROR: token must be defined`.
 * - Este módulo **no** importa `HeaderComponent` de forma estática: el servidor no ejecuta
 *   `HeaderComponent_Factory`.
 *
 * `afterNextRender`: solo corre en el navegador, tras el primer pintado; evita acoplar
 * `PLATFORM_ID` + `import()` en el constructor.
 *
 * `ngSkipHydration` en el **host** del componente (no en un div interno): Angular NG0504 exige
 * que el flag esté en el elemento host (`<app-header-host>`).
 */
@Component({
  selector: 'app-header-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NgComponentOutlet],
  host: {
    ngSkipHydration: '',
  },
  template: `
    <div class="header-host">
      @if (headerType(); as Cmp) {
        <ng-container *ngComponentOutlet="Cmp" />
      } @else if (loadError()) {
        <header class="header-host__placeholder" role="banner" aria-label="SJ AURA">
          <span class="header-host__fallback">SJ AURA</span>
        </header>
      } @else {
        <div class="header-host__placeholder" role="banner" aria-label="SJ AURA"></div>
      }
    </div>
  `,
  styleUrl: './header-host.component.scss',
})
export class HeaderHostComponent {
  /** Tipo del componente pesado; `null` = SSR o chunk aún no cargado. */
  readonly headerType = signal<Type<HeaderComponent> | null>(null);
  readonly loadError = signal(false);

  constructor() {
    afterNextRender(() => {
      void import('../shared/components/header/header.component')
        .then((m) => this.headerType.set(m.HeaderComponent))
        .catch(() => this.loadError.set(true));
    });
  }
}
