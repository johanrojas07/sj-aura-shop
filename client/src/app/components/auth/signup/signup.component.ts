import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
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
export class SignUpComponent {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(SignalStore);
  private readonly selectors = inject(SignalStoreSelectors);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
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

  signUpForm: FormGroup = this.fb.group({
    name: ['', [Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }
    this.store.clearAuthError();
    const { email, password } = this.signUpForm.value;
    const rawName = String(this.signUpForm.value.name ?? '').trim();
    this.store
      .signUp({ email, password })
      .pipe(take(1))
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        const lang = this.selectors.appLang();
        const go = () => void this.router.navigateByUrl(`/${lang}/product/all`);
        if (rawName) {
          this.store.patchProfile({ name: rawName }).pipe(take(1)).subscribe({
            next: () => go(),
            error: () => go(),
          });
          return;
        }
        go();
      });
  }

  dismissError(): void {
    this.store.clearAuthError();
  }
}
