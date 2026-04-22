import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs/operators';

import { TranslateService } from '../../../services/translate.service';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
  imports: [
    CommonModule,
    TranslatePipe,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(SignalStore);
  private readonly selectors = inject(SignalStoreSelectors);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      if (this.selectors.authLoading()) {
        return;
      }
      const u = this.selectors.user();
      if (u?.email) {
        const lang = this.selectors.appLang();
        void this.router.navigateByUrl(`/${lang}/account`, { replaceUrl: true });
      }
    });
  }

  readonly lang$ = this.translate.getLang$();
  readonly loading$ = toObservable(this.selectors.authLoading);
  readonly authError = this.selectors.authError;

  signInForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }
    this.store.clearAuthError();
    const { email, password } = this.signInForm.value;
    this.store
      .signIn({ email, password })
      .pipe(take(1))
      .subscribe((ok) => {
        if (ok) {
          const raw = this.route.snapshot.queryParamMap.get('returnUrl');
          const lang = this.selectors.appLang();
          const target =
            raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : `/${lang}/product/all`;
          void this.router.navigateByUrl(target);
        }
      });
  }

  dismissError(): void {
    this.store.clearAuthError();
  }
}
