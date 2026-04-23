import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  PLATFORM_ID,
  Inject,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
} from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { take } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-carousel',
    templateUrl: './carousel.component.html',
    styleUrls: ['./carousel.component.scss'],
    imports: [MatButtonModule]
})
export class CarouselComponent implements AfterViewInit, OnDestroy {
  @ViewChild('slides') slides: ElementRef<HTMLDivElement>;
  @ViewChild('slideContainer') slideContainer: ElementRef<HTMLDivElement>;

  @Input() intervalForSlider = 10000;
  @Input() withBackground = false;
  @Input() absoluteArrows = false;
  @Input() showArrows = true;
  /** Puntos inferiores + anillo de progreso hasta el siguiente slide. */
  @Input() showDots = true;
  /** Si es false, no hay avance automático (solo flechas / gesto). */
  @Input() autoAdvance = true;
  /** Índice del slide más visible (0 = hero/banner, ≥1 típicamente producto). */
  @Output() activeSlideIndex = new EventEmitter<number>();

  showArrowsSig = signal(false);
  slideCount = signal(0);
  activeIndex = signal(0);
  /** Se incrementa al cambiar de slide para reiniciar la animación del anillo SVG. */
  animKey = signal(0);
  slideIndices = computed(() => {
    const n = this.slideCount();
    return n > 0 ? Array.from({ length: n }, (_, i) => i) : [];
  });

  private autoAdvanceSub?: Subscription;
  private slidesScrollCleanup?: () => void;
  private mutationObs?: MutationObserver;
  private lastEmittedIndex = -1;

  constructor(
    @Inject(PLATFORM_ID)
    private platformId : Object) { }

  private currentSlideIndexFromScroll(): number {
    const el = this.slides?.nativeElement;
    if (!el) {
      return 0;
    }
    const w = el.getBoundingClientRect().width;
    const n = el.children.length;
    if (n <= 0 || w <= 0) {
      return 0;
    }
    let i = Math.round(el.scrollLeft / w);
    i = ((i % n) + n) % n;
    return i;
  }

  /** Fija scroll al slide i (0..n-1); evita errores por subpíxeles y snap. */
  private scrollToSlideIndex(i: number, useSmooth: boolean): void {
    const el = this.slides?.nativeElement;
    if (!el || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const w = el.getBoundingClientRect().width;
    const n = el.children.length;
    if (n <= 0 || w <= 0) {
      return;
    }
    const idx = ((i % n) + n) % n;
    const behavior: ScrollBehavior = useSmooth ? 'smooth' : 'auto';
    el.scrollTo({ left: idx * w, behavior });
    requestAnimationFrame(() => this.emitActiveSlideIndex());
  }

  onClickLeft() {
    const n = this.slides?.nativeElement?.children.length ?? 0;
    if (n <= 0) {
      return;
    }
    const current = this.currentSlideIndexFromScroll();
    this.scrollToSlideIndex(current - 1, this.useSmoothForArrowClicks());
  }

  onClickRight() {
    const n = this.slides?.nativeElement?.children.length ?? 0;
    if (n <= 0) {
      return;
    }
    const current = this.currentSlideIndexFromScroll();
    this.scrollToSlideIndex(current + 1, this.useSmoothForArrowClicks());
  }

  /** Suave solo en escritorio; en móvil evita "saltos" raros. */
  private useSmoothForArrowClicks(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    return typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
  }

  goToSlide(i: number): void {
    this.scrollToSlideIndex(i, false);
  }

  private syncSlideCount(): void {
    const el = this.slides?.nativeElement;
    if (!el) {
      return;
    }
    const n = el.children.length;
    this.slideCount.set(n);
    const cur = this.activeIndex();
    if (n > 0 && cur >= n) {
      this.activeIndex.set(n - 1);
      this.lastEmittedIndex = n - 1;
    }
  }

  private scheduleNextSlide(): void {
    this.autoAdvanceSub?.unsubscribe();
    if (!this.autoAdvance || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const el = this.slides?.nativeElement;
    const n = el?.children?.length ?? 0;
    if (n <= 1) {
      return;
    }
    this.autoAdvanceSub = timer(this.intervalForSlider).subscribe(() => {
      this.onClickRight();
    });
  }

  private emitActiveSlideIndex(): void {
    const el = this.slides?.nativeElement;
    if (!el || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const w = el.getBoundingClientRect().width;
    if (w <= 0) {
      return;
    }
    this.syncSlideCount();
    const n = el.children.length;
    if (!n) {
      return;
    }
    let idx = Math.round(el.scrollLeft / w);
    idx = ((idx % n) + n) % n;
    if (idx !== this.lastEmittedIndex) {
      this.lastEmittedIndex = idx;
      this.activeIndex.set(idx);
      this.animKey.update((k) => k + 1);
      this.activeSlideIndex.emit(idx);
      this.scheduleNextSlide();
    }
  }

  private bindSlidesScroll(): void {
    const el = this.slides?.nativeElement;
    if (!el || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const handler = () => this.emitActiveSlideIndex();
    el.addEventListener('scroll', handler, { passive: true });
    this.slidesScrollCleanup = () => el.removeEventListener('scroll', handler);
    requestAnimationFrame(() => this.emitActiveSlideIndex());
  }

  private bindSlideChildrenObserver(): void {
    const el = this.slides?.nativeElement;
    if (!el || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.mutationObs?.disconnect();
    this.mutationObs = new MutationObserver(() => {
      const before = this.slideCount();
      this.syncSlideCount();
      const after = el.children.length;
      this.updateShowArrowsVisibility();
      requestAnimationFrame(() => this.emitActiveSlideIndex());
      if (after > 1 && before <= 1) {
        this.scheduleNextSlide();
      }
    });
    this.mutationObs.observe(el, { childList: true });
    this.syncSlideCount();
  }

  private updateShowArrowsVisibility(): void {
    if (!isPlatformBrowser(this.platformId) || !this.showArrows) {
      return;
    }
    const slidesElement = this.slides?.nativeElement;
    if (!slidesElement) {
      return;
    }
    if (slidesElement.children?.[0]) {
      this.showArrowsSig.set(
        slidesElement.offsetWidth < slidesElement.children[0].clientWidth * slidesElement.children.length
      );
    } else {
      this.showArrowsSig.set(true);
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      timer(0, 300)
        .pipe(take(1))
        .subscribe(() => {
          this.updateShowArrowsVisibility();
      });
      this.bindSlidesScroll();
      this.bindSlideChildrenObserver();
    }
  }

  ngOnDestroy(): void {
    this.slidesScrollCleanup?.();
    this.mutationObs?.disconnect();
    this.autoAdvanceSub?.unsubscribe();
  }
}
