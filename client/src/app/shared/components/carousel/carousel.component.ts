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
  dragging = false;
  private slidesScrollCleanup?: () => void;
  private mutationObs?: MutationObserver;
  private lastEmittedIndex = -1;

  constructor(
    @Inject(PLATFORM_ID)
    private platformId : Object) { }

  onClickLeft() {
    const slidesElement = this.slides.nativeElement;
    const slidesElementWIDTH = slidesElement.getBoundingClientRect().width;
    slidesElement.scrollLeft -= slidesElementWIDTH;
    if (!slidesElement.scrollLeft) {
      slidesElement.scrollLeft += slidesElementWIDTH * slidesElement.children.length - 1;
    }
    requestAnimationFrame(() => this.emitActiveSlideIndex());
  }

  onClickRight() {
    const slidesElement = this.slides.nativeElement;
    const slidesElementWIDTH = slidesElement.getBoundingClientRect().width;
    slidesElement.scrollLeft += slidesElementWIDTH;
    if ((parseFloat((slidesElement.scrollWidth - slidesElement.scrollLeft).toFixed()) <= parseFloat(slidesElementWIDTH.toFixed()))) {
      slidesElement.scrollLeft = 0;
    }
    requestAnimationFrame(() => this.emitActiveSlideIndex());
  }

  goToSlide(i: number): void {
    const el = this.slides?.nativeElement;
    if (!el || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const n = el.children.length;
    if (n <= 0) {
      return;
    }
    const w = el.getBoundingClientRect().width;
    if (w <= 0) {
      return;
    }
    const idx = ((i % n) + n) % n;
    el.scrollTo({ left: idx * w, behavior: 'auto' });
    requestAnimationFrame(() => this.emitActiveSlideIndex());
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
      requestAnimationFrame(() => this.emitActiveSlideIndex());
      if (after > 1 && before <= 1) {
        this.scheduleNextSlide();
      }
    });
    this.mutationObs.observe(el, { childList: true });
    this.syncSlideCount();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      timer(0, 300)
        .pipe(take(1))
        .subscribe(() => {
          const slidesElement = this.slides.nativeElement;
          if (slidesElement.children && slidesElement.children[0]) {
            this.showArrowsSig.set(
              slidesElement.offsetWidth < slidesElement.children[0].clientWidth * slidesElement.children.length
            );
          } else {
            this.showArrowsSig.set(true);
          }
      });
      this.bindSlidesScroll();
      this.bindSlideChildrenObserver();
    }
  }

  onDrag(e, type: string) {
    this.dragging = type === 'down' ? true : (type === 'up' ? false : this.dragging);
    if (this.dragging && type === 'move') {
      const slidesElement = this.slides.nativeElement;
      slidesElement.scrollLeft += e.movementX * -50;
    }
  }

  ngOnDestroy(): void {
    this.slidesScrollCleanup?.();
    this.mutationObs?.disconnect();
    this.autoAdvanceSub?.unsubscribe();
  }
}
