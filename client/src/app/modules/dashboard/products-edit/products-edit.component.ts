import { filter, first, take, startWith, map } from 'rxjs/operators';
import { Component, OnInit, Input, OnDestroy, inject, Injector, runInInjectionContext } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, Observable, Subscription, BehaviorSubject, combineLatest, of, timer } from 'rxjs';

import { ApiService } from '../../../services/api.service';
import { languages } from '../../../shared/constants';
import { Product, Category } from '../../../shared/models';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { toObservable } from '@angular/core/rxjs-interop';
import { isAspectTooSquareForFashion, loadImageFromFile } from './image-crop.util';
import { ProductImageCropDialogComponent } from './product-image-crop-dialog.component';

@Component({
    selector: 'app-products-edit',
    templateUrl: './products-edit.component.html',
    styleUrls: ['./products-edit.component.scss'],
    standalone: false
})
export class ProductsEditComponent implements OnInit, OnDestroy {
  private readonly injector = inject(Injector);

  @Input() action: string;
  @Input() titles: string[];
  @Input() productToEditTitleUrl: string;

  productEditForm: FormGroup;
  images$: Observable<string[]>;
  sendRequest = false;
  product$: Observable<Product>;
  categories$: Observable<Category[]>;
  productSub?: Subscription;
  languageOptions = languages;
  choosenLanguageSub$ = new BehaviorSubject<string>('es');
  testImageUrl: string;
  filteredTitles$: Observable<string[]>;
  tag: string;
  /** Mientras se suben imágenes al almacenamiento. */
  imageUploading = false;

  private readonly dialog = inject(MatDialog);

  constructor(
    private fb: FormBuilder,
    private store: SignalStore,
    private selectors: SignalStoreSelectors,
    private apiService: ApiService,
    private route: ActivatedRoute,
  ) {
    this.createForm();
    /** Cargar producto completo en edición (el API siempre trae título; filtrar por !title rompía el formulario). */
    this.product$ = toObservable(this.selectors.product).pipe(
      filter((product) => !!product?.titleUrl),
    );
    this.categories$ = toObservable(this.selectors.categories);
    this.images$ = toObservable(this.selectors.productImages);
    this.store.getCategories(languages[0]);
  }

  /** titleUrl para subidas / API (ruta o formulario). */
  /** Idioma de ruta (tienda) para enlaces al dashboard. */
  dashNavLang(): string {
    const l = this.selectors.appLang();
    return l && String(l).trim() ? l : languages[0];
  }

  uploadTitleUrl(): string {
    return (
      this.productToEditTitleUrl ||
      this.route.snapshot.paramMap.get('titleUrl') ||
      String(this.productEditForm.get('titleUrl')?.value ?? '').trim()
    );
  }

  ngOnInit(): void {
    const dataAction = this.route.snapshot.data['action'] as string | undefined;
    if (dataAction) {
      this.action = dataAction;
    }
    const paramTitle = this.route.snapshot.paramMap.get('titleUrl');
    if (paramTitle) {
      this.productToEditTitleUrl = paramTitle;
    }

    this.store.getImages();
    if (this.productToEditTitleUrl) {
      this.store.getProduct(this.productToEditTitleUrl);
    }

    if (!this.titles?.length) {
      this.store.getAllProducts();
    }

    const titles$ =
      this.titles && this.titles.length
        ? of(this.titles)
        : runInInjectionContext(this.injector, () =>
            toObservable(this.selectors.allProducts).pipe(
              map((products) =>
                Array.isArray(products) ? products.map((p) => p.titleUrl).filter(Boolean) : [],
              ),
              startWith([] as string[]),
            ),
          );

    this.filteredTitles$ = combineLatest([
      this.productEditForm.get('titleUrl')!.valueChanges.pipe(
        startWith(this.productEditForm.get('titleUrl')!.value || ''),
      ),
      titles$,
    ]).pipe(
      map(([value, titles]) => {
        const filterValue = String(value || '').toLowerCase();
        return (titles || []).filter((option) => String(option).toLowerCase().includes(filterValue));
      }),
    );

    if (this.action === 'add') {
      this.applyAddValidators();
    } else {
      this.productEditForm.get('titleUrl')?.setValidators([Validators.required]);
      this.productEditForm.get('titleUrl')?.updateValueAndValidity({ emitEvent: false });
    }
    this.wirePriceValidators();

    if (this.action === 'edit' && this.productToEditTitleUrl) {
      this.productSub = this.product$.subscribe((product) => {
        const doc = product as Product & Record<string, { stock?: string } | undefined>;
        const invStatus = doc.es?.stock || doc.en?.stock || 'onStock';
        const invQty = typeof doc.stockQty === 'number' ? doc.stockQty : 0;
        const newForm = {
          titleUrl: product.titleUrl,
          mainImage: product.mainImage && product.mainImage.url ? product.mainImage.url : '',
          tags: product.tags,
          images: product.images || [],
          imageUrl: '',
          inventoryStatus: invStatus,
          inventoryQty: invQty,
          ...this.prepareLangEditForm(product),
        };

        this.productEditForm.setValue(newForm);
      });
    }
  }

  ngOnDestroy(): void {
    if (this.productSub) {
      this.productSub.unsubscribe();
    }
  }

  onFileChanged(event: Event): void {
    void this.handleFileSelection(event);
  }

  private async handleFileSelection(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const files = el.files;
    if (!files?.length) {
      return;
    }
    this.imageUploading = true;
    try {
      for (const file of Array.from(files)) {
        if (!file.type.match(/^image\//)) {
          continue;
        }
        await this.processAndUploadFile(file);
      }
    } finally {
      this.imageUploading = false;
      el.value = '';
    }
  }

  /** Misma lógica que el servidor: varias imágenes en `images[]`; ofrece recorte 3:4 si la foto es demasiado cuadrada. */
  private async processAndUploadFile(file: File): Promise<void> {
    const img = await loadImageFromFile(file);
    let toUpload: File = file;
    if (isAspectTooSquareForFashion(img.naturalWidth, img.naturalHeight)) {
      const ref = this.dialog.open(ProductImageCropDialogComponent, {
        data: { file },
        width: 'min(100vw, 420px)',
        maxHeight: '90vh',
        autoFocus: 'first-heading',
      });
      const r = await firstValueFrom(ref.afterClosed());
      if (r == null || r.action === 'cancel') {
        return;
      }
      if (r.action === 'cropped') {
        toUpload = r.file;
      }
    }
    await this.uploadImageFile(toUpload);
  }

  private uploadImageFile(file: File): Promise<void> {
    return new Promise((resolve) => {
      const up = this.apiService.uploadImage({
        fileToUpload: file,
        titleUrl: this.uploadTitleUrl(),
      });
      if (!up) {
        resolve();
        return;
      }
      up.pipe(take(1)).subscribe((result: any) => {
        if (result?.error) {
          resolve();
          return;
        }
        if (result?.titleUrl) {
          this.store.storeProduct(result);
        } else if (result?.all && Array.isArray(result.all)) {
          this.store.storeProductImages(result);
          const m = this.productEditForm.get('mainImage');
          if (m && !String(m.value || '').trim() && result.all.length) {
            m.setValue(result.all[0] ?? '');
            m.updateValueAndValidity({ emitEvent: true });
          }
        }
        resolve();
      });
    });
  }

  /** Solo dígitos COP (sin puntos ni comas); máx. 12 cifras. */
  onCopDigitsInput(field: 'regularPrice' | 'salePrice', event: Event): void {
    const lang = this.choosenLanguageSub$.getValue();
    const g = this.productEditForm.get(lang) as FormGroup;
    const el = event.target as HTMLInputElement;
    const only = el.value.replace(/\D/g, '').slice(0, 12);
    if (el.value !== only) {
      el.value = only;
    }
    g.get(field)?.setValue(only, { emitEvent: true });
  }

  addSuggestedTag(slug: string): void {
    const s = String(slug || '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase();
    if (!s) {
      return;
    }
    const tags = (this.productEditForm.get('tags')?.value as string[]) || [];
    if (tags.includes(s)) {
      return;
    }
    this.productEditForm.get('tags')?.setValue([...tags, s]);
  }

  createForm(): void {
    this.productEditForm = this.fb.group({
      titleUrl: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
      mainImage: [''],
      tags: [[]],
      images: [[]],
      imageUrl: [''],
      inventoryStatus: ['onStock', Validators.required],
      inventoryQty: [0, [Validators.required, Validators.min(0), Validators.max(9999999)]],
      ...this.createLangForm(this.languageOptions),
    });
  }

  private applyAddValidators(): void {
    /* Portada: URL manual o al menos una imagen subida (galería). */
    this.productEditForm.get('mainImage')?.clearValidators();
    const es = this.productEditForm.get('es') as FormGroup;
    es.get('title')?.setValidators([Validators.required, Validators.minLength(2)]);
    es.updateValueAndValidity({ emitEvent: false });
    this.productEditForm.get('mainImage')?.updateValueAndValidity({ emitEvent: false });
  }

  /** Precios en pesos COP: solo dígitos (sin puntos). En alta, precio actual (`salePrice`) en ES es obligatorio. */
  private wirePriceValidators(): void {
    for (const lang of this.languageOptions) {
      const g = this.productEditForm.get(lang) as FormGroup;
      const saleValidators =
        lang === 'es' && this.action === 'add' ? [Validators.required, copCOPRequired] : [copCOPOptional];
      g.get('salePrice')?.setValidators(saleValidators);
      g.get('regularPrice')?.setValidators([copCOPOptional]);
      g.get('regularPrice')?.updateValueAndValidity({ emitEvent: false });
      g.get('salePrice')?.updateValueAndValidity({ emitEvent: false });
    }
  }

  onRemoveImage(image: string, type: string, galleryUrls?: string[] | null): void {
    const main = String(this.productEditForm.get('mainImage')?.value ?? '').trim();
    if (main === image) {
      const rest = (galleryUrls || []).filter((u) => u !== image);
      this.productEditForm.get('mainImage')?.setValue(rest[0] ?? '');
    }
    const titleUrl = type === 'product' ? { titleUrl: this.productEditForm.get('titleUrl').value } : {};

    this.store.removeImage({ image: image, ...titleUrl });
  }

  /** Portada del catálogo: puede ser cualquier imagen de la galería, no solo la primera. */
  setCoverImage(url: string): void {
    const u = String(url || '').trim();
    if (!u) {
      return;
    }
    this.productEditForm.get('mainImage')?.setValue(u);
    this.productEditForm.get('mainImage')?.markAsDirty();
  }

  /** URL que recibe el badge «Portada»: campo principal o, si está vacío, la primera de la galería. */
  coverForGallery(gallery: string[] | null | undefined): string {
    const m = String(this.productEditForm.get('mainImage')?.value ?? '').trim();
    if (m) {
      return m;
    }
    const g0 = gallery?.length ? String(gallery[0] ?? '').trim() : '';
    return g0;
  }

  setLang(lang: string): void {
    timer(100)
      .pipe(take(1))
      .subscribe(() => this.choosenLanguageSub$.next(lang));
  }

  addTag(): void {
    const raw = String(this.tag || '').trim();
    if (!raw) {
      return;
    }
    const t = raw.replace(/\s+/g, '_').toLowerCase();
    const formTags = (this.productEditForm.value.tags || []).filter((x: string) => x !== t);
    this.productEditForm.get('tags')?.setValue([...formTags, t]);
    this.tag = '';
  }

  onTagAutocompleteSelected(e: MatAutocompleteSelectedEvent): void {
    this.tag = String(e.option.value ?? '');
    this.addTag();
  }

  removeTag(tagToRemove: string): void {
    const formTags = (this.productEditForm.value.tags || []).filter((tag: string) => tag !== tagToRemove);
    this.productEditForm.get('tags')?.setValue(formTags);
  }

  addImageUrl(): void {
    const imageUrl = this.productEditForm.get('imageUrl').value;
    const titleUrl = this.productEditForm.get('titleUrl').value;
    if (imageUrl && titleUrl) {
      this.testImageUrl = imageUrl;
    }
  }

  checkImageUrl() {
    const imageUrl = this.productEditForm.get('imageUrl').value;
    const titleUrl = this.productEditForm.get('titleUrl').value;
    this.store.addProductImagesUrl({ image: imageUrl, titleUrl });
    this.testImageUrl = '';
  }

  openForm(): void {
    this.sendRequest = false;
  }

  findProduct(): void {
    const titleUrl = this.productEditForm.get('titleUrl').value;
    if (titleUrl) {
      this.store.getProduct(titleUrl);
    }
  }

  formatTitleUrl(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.value) {
      const titleUrlFormated = el.value.replace(/\s+/g, '-').toLowerCase();
      const c = this.productEditForm.get('titleUrl');
      c?.setValue(titleUrlFormated);
      this.clearTitleUrlTakenError();
    }
  }

  /** Quitar error de slug duplicado al corregir el campo. */
  clearTitleUrlTakenError(): void {
    const c = this.productEditForm.get('titleUrl');
    if (!c?.errors?.['titleUrlTaken']) {
      return;
    }
    const { titleUrlTaken: _t, ...rest } = c.errors;
    c.setErrors(Object.keys(rest).length ? rest : null);
  }

  private isTitleUrlTaken(slug: string): boolean {
    const s = String(slug || '').trim().toLowerCase();
    if (!s) {
      return false;
    }
    const list = this.selectors.allProducts() ?? [];
    return list.some((p) => String(p.titleUrl || '').trim().toLowerCase() === s);
  }

  /** Copia título, precios, descripciones y flags de ES → EN (sin IA; revisa en pestaña EN). */
  copyEsToEn(): void {
    const es = this.productEditForm.get('es') as FormGroup;
    const en = this.productEditForm.get('en') as FormGroup;
    if (!es || !en) {
      return;
    }
    en.patchValue({ ...es.value });
  }

  onSubmit(): void {
    this.productEditForm.markAllAsTouched();
    if (this.productEditForm.invalid) {
      return;
    }

    switch (this.action) {
      case 'add':
        this.images$.pipe(first()).subscribe((images) => {
          if (images && images.length) {
            this.productEditForm.patchValue({ images: images });
          }

          const raw = this.productEditForm.getRawValue() as Record<string, unknown>;
          const { inventoryStatus, inventoryQty, ...rest } = raw;
          const slug = String(rest['titleUrl'] ?? '').trim();
          if (this.isTitleUrlTaken(slug)) {
            const c = this.productEditForm.get('titleUrl');
            c?.setErrors({ ...(c.errors || {}), titleUrlTaken: true });
            c?.markAsTouched();
            return;
          }

          const imgs = (images && images.length ? images : (rest['images'] as string[])) || [];
          const mainUrl = String(rest['mainImage'] ?? '').trim() || (imgs[0] ?? '');
          if (!mainUrl) {
            this.productEditForm.get('mainImage')?.setErrors({ needImage: true });
            this.productEditForm.get('mainImage')?.markAsTouched();
            return;
          }
          this.productEditForm.get('mainImage')?.setErrors(null);

          const stockQty = Math.max(0, Math.floor(Number(inventoryQty) || 0));
          const langPayload = this.prepareProductData(this.languageOptions, {
            ...rest,
            inventoryStatus,
          } as Record<string, unknown>);

          const productPrepare = {
            ...rest,
            ...langPayload,
            images: imgs.length ? imgs : rest['images'] ?? [],
            stockQty,
            mainImage: {
              url: mainUrl,
              name: rest['titleUrl'],
            },
          };

          this.apiService.addProduct(productPrepare).pipe(take(1)).subscribe((response: any) => {
            if (response?.error) {
              const status = (response.error as { status?: number })?.status;
              if (status === 400) {
                const c = this.productEditForm.get('titleUrl');
                c?.setErrors({ ...(c.errors || {}), titleUrlTaken: true });
                c?.markAsTouched();
              }
              return;
            }
            this.store.getAllProducts();
            this.sendRequest = true;
          });
        });
        break;

      case 'edit': {
        const rawEdit = this.productEditForm.getRawValue() as Record<string, unknown>;
        const { inventoryStatus: invS, inventoryQty: invQ, ...payload } = rawEdit;
        const stockQtyEdit = Math.max(0, Math.floor(Number(invQ) || 0));
        const langPayload = this.prepareProductData(this.languageOptions, {
          ...rawEdit,
          inventoryStatus: invS,
        } as Record<string, unknown>);
        const productPrepareEdit = {
          ...payload,
          ...langPayload,
          stockQty: stockQtyEdit,
          mainImage: {
            url: this.productEditForm.value.mainImage,
            name: this.productEditForm.value.titleUrl,
          },
        };

        this.store.editProduct(productPrepareEdit);
        this.sendRequest = true;
        break;
      }
    }
  }

  onRemoveSubmit(): void {
    this.store.removeProduct(this.productEditForm.get('titleUrl').value);
    this.sendRequest = true;
  }

  private createLangForm(languageOptions: Array<string>) {
    return languageOptions
      .map((lang: string) => ({
        [lang]: this.fb.group({
          title: [''],
          description: [''],
          salePrice: [''],
          regularPrice: [''],
          visibility: [false],
          onSale: [false],
        }),
      }))
      .reduce((prev, curr) => ({ ...prev, ...curr }), {});
  }

  private prepareLangEditForm(product) {
    return this.languageOptions
      .map((lang: string) => {
        const productLang = product[lang] || {};
        const sale = productLang.salePrice != null ? String(productLang.salePrice).replace(/\D/g, '') : '';
        const reg = productLang.regularPrice != null ? String(productLang.regularPrice).replace(/\D/g, '') : '';
        return {
          [lang]: {
            title: productLang.title || '',
            description: productLang.description || '',
            salePrice: sale,
            regularPrice: reg,
            visibility: !!productLang.visibility,
            onSale: !!productLang.onSale,
          },
        };
      })
      .reduce((prev, curr) => ({ ...prev, ...curr }), {});
  }

  private prepareProductData(languageOptions: Array<string>, formData: Record<string, unknown>) {
    const inv = String(formData['inventoryStatus'] || 'onStock');
    return languageOptions
      .map((lang: string) => {
        const raw = (formData[lang] as Record<string, unknown>) || {};
        const regStr = String(raw['regularPrice'] ?? '').replace(/\D/g, '');
        const saleStr = String(raw['salePrice'] ?? '').replace(/\D/g, '');
        const regularPrice = regStr === '' ? 0 : Number(regStr);
        const salePrice = saleStr === '' ? 0 : Number(saleStr);
        const { regularPrice: _rp, salePrice: _sp, descriptionFull: _df, ...restLang } = raw;
        const description = String(raw['description'] ?? '').trim();
        const descriptionFull = shortDescriptionToFullBlocks(description);
        return {
          [lang]: {
            ...restLang,
            descriptionFull,
            regularPrice,
            salePrice,
            stock: inv,
            shipping: 'basic',
          },
        };
      })
      .reduce((prev, curr) => ({ ...prev, ...curr }), {});
  }
}

/** Bloques HTML de ficha: se derivan de la descripción corta (sin editor largo en admin). */
function shortDescriptionToFullBlocks(description: string): string[] {
  const d = String(description ?? '').trim();
  if (!d) {
    return [];
  }
  if (/<[a-z][\s\S]*>/i.test(d)) {
    return [d];
  }
  return ['<p>' + d.replace(/\n+/g, '</p><p>').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'];
}

function copCOPOptional(c: AbstractControl): ValidationErrors | null {
  const v = String(c.value ?? '').trim();
  if (!v) {
    return null;
  }
  return /^\d{1,12}$/.test(v) ? null : { cop: true };
}

function copCOPRequired(c: AbstractControl): ValidationErrors | null {
  const v = String(c.value ?? '').trim();
  if (!v) {
    return { required: true };
  }
  return /^\d{1,12}$/.test(v) ? null : { cop: true };
}
