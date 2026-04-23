import {
  Component,
  ElementRef,
  Renderer2,
  PLATFORM_ID,
  Inject,
  inject,
} from '@angular/core';
import {
  CommonModule,
  isPlatformBrowser,
  isPlatformServer,
} from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take, delay, map, skip, distinctUntilChanged } from 'rxjs/operators';
import { of } from 'rxjs';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';

import { TranslateService } from './services/translate.service';
import { JsonLDService } from './services/jsonLD.service';
import { User } from './shared/models';
import { currencyLang, languages } from './shared/constants';
import { SignalStore } from './store/signal.store';
import { SignalStoreSelectors } from './store/signal.store.selectors';
import { FooterComponent } from './shared/components/footer/footer.component';
import { HeaderHostComponent } from './layout/header-host.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { CartDrawerComponent } from './shared/components/cart-drawer/cart-drawer.component';
import { CartDrawerService } from './services/cart-drawer.service';
import { ProductQuickViewComponent } from './shared/components/product-quick-view/product-quick-view.component';

@Component({
    selector: 'eshop-mean-app',
    imports: [CommonModule, RouterOutlet, FooterComponent, HeaderHostComponent, MatSidenavModule, CartDrawerComponent, ProductQuickViewComponent],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly cartDrawer = inject(CartDrawerService);

  rememberScroll  : {[component: string]: number} = {};
  position = 0;

  constructor(
    private elRef: ElementRef,
    private renderer: Renderer2,
    private router: Router,
    private translate: TranslateService,
    private jsonLDService: JsonLDService,
    @Inject(PLATFORM_ID)
    private platformId: Object,
    private signalStore: SignalStore,
    private selectors: SignalStoreSelectors
  ) {
    this.translate.getLang$()
      .pipe(filter(Boolean), take(1))
      .subscribe((lang: string) => {
        const langUpdate = {
          lang,
          currency  : currencyLang[lang]
        };
        this.signalStore.changeLanguage(langUpdate);
    });


    toObservable(this.selectors.appLang)
      .pipe(filter(Boolean), skip(1))
      .subscribe((lang: string) => {
        translate.use(lang);
    });

    toObservable(this.selectors.position)
      .pipe(filter(Boolean))
      .subscribe((componentPosition: {[component: string]: number}) => {
        this.rememberScroll = {...this.rememberScroll, ...componentPosition};
        this.renderer.setProperty(this.elRef.nativeElement.querySelector('.main-scroll-wrap'), 'scrollTop', 0);
    });

    if (isPlatformBrowser(this.platformId)) {
      this.signalStore.getUser();
    }

    toObservable(this.selectors.user).pipe(delay(100))
      .subscribe((user: User) => {
      if (user && user.email) {
        this.signalStore.getUserOrders();
      }
    });

    this.translate
      .getLang$()
      .pipe(
        filter((lang) => !!lang && isPlatformBrowser(this.platformId)),
        distinctUntilChanged(),
      )
      .subscribe((lang) => {
        this.signalStore.getCart(lang);
        this.signalStore.getPages({ lang, titles: true });
        this.signalStore.getCategories(lang);
      });

    if (isPlatformServer(this.platformId)) {
      this.jsonLDService.insertSchema(this.jsonLDService.websiteSchema);
      this.jsonLDService.insertSchema(this.jsonLDService.orgSchema, 'structured-data-org');
    }

    this.router.events.pipe(
      filter((event) => event instanceof NavigationStart),
      map((checkRoute: NavigationStart) => {
        this.jsonLDService.insertSchema(this.jsonLDService.websiteSchema);
        this.jsonLDService.insertSchema(this.jsonLDService.orgSchema, 'structured-data-org');
      })
     );

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        if (!isPlatformBrowser(this.platformId)) {
          return;
        }
        this.applyRouteHeaderClasses(this.router.url);
        requestAnimationFrame(() => {
          const wrap = this.elRef.nativeElement.querySelector('.main-scroll-wrap') as HTMLElement | null;
          if (wrap) {
            this.syncHeaderScrollMode(wrap.scrollTop);
          }
        });
      });

    if (isPlatformBrowser(this.platformId)) {
      queueMicrotask(() => this.applyRouteHeaderClasses(this.router.url));
    }
  }

  onScrolling(event: Event): void {
    const target = event.target as HTMLElement;
    this.position = target?.scrollTop ?? 0;
    this.syncHeaderScrollMode(this.position);
  }

  /** Solo la home usa scroll para transparente / compacto; el resto de rutas = header sólido siempre. */
  private isHomeUrl(url: string): boolean {
    const path = url.split('?')[0];
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return true;
    }
    if (segments.length === 1 && languages.includes(segments[0])) {
      return true;
    }
    return false;
  }

  private applyRouteHeaderClasses(url: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const html = document.documentElement;
    if (this.isHomeUrl(url)) {
      html.classList.add('eshop-route-home');
      html.classList.remove('eshop-route-inner');
    } else {
      html.classList.remove('eshop-route-home');
      html.classList.remove('eshop-header-compact');
      html.classList.add('eshop-route-inner');
    }
  }

  /** Al bajar del tope en la home: oculta anuncios y header sólido. Fuera de home no aplica. */
  private syncHeaderScrollMode(scrollTop: number): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const html = document.documentElement;
    if (!html.classList.contains('eshop-route-home')) {
      html.classList.remove('eshop-header-compact');
      return;
    }
    const threshold = 10;
    if (scrollTop > threshold) {
      html.classList.add('eshop-header-compact');
    } else {
      html.classList.remove('eshop-header-compact');
    }
  }

  onActivate(component: string): void {
    const currentComponent = component['component'];
    const position = (currentComponent && this.rememberScroll[currentComponent])
      ? this.rememberScroll[currentComponent]
      : 0;

    of('activate_event').pipe(delay(5), take(1)).subscribe(() => {
      const wrap = this.elRef.nativeElement.querySelector('.main-scroll-wrap') as HTMLElement;
      this.renderer.setProperty(wrap, 'scrollTop', position);
      this.syncHeaderScrollMode(position);
    });
  }

  onDeactivate(component: string): void {
    if (Object.keys(component).includes('component')) {
      const currentComponent = component['component'];
      this.rememberScroll = {...this.rememberScroll, [currentComponent]: this.position};
    }
  }
}
