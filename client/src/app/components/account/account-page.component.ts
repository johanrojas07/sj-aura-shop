import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { TranslatePipe } from '../../pipes/translate.pipe';
import { SignalStore } from '../../store/signal.store';
import { SignalStoreSelectors } from '../../store/signal.store.selectors';
import { TranslateService } from '../../services/translate.service';
import type { User } from '../../shared/models';

@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './account-page.component.html',
  styleUrls: ['./account-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly signalStore = inject(SignalStore);
  private readonly selectors = inject(SignalStoreSelectors);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly user = this.selectors.user;
  readonly lang$ = this.translate.getLang$();
  readonly saving = signal(false);

  profileForm: FormGroup = this.fb.group({
    name: ['', [Validators.maxLength(120)]],
  });

  ngOnInit(): void {
    const u = this.selectors.user() as User | null;
    const n = u?.name;
    const nameStr = typeof n === 'string' ? n : n != null ? String(n) : '';
    this.profileForm.patchValue({ name: nameStr }, { emitEvent: false });
  }

  signOut(): void {
    this.signalStore.signOut();
    const lang = this.selectors.appLang();
    void this.router.navigateByUrl(`/${lang}/authorize/signin`, { replaceUrl: true });
  }

  saveName(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const name = String(this.profileForm.get('name')?.value ?? '').trim();
    this.saving.set(true);
    this.signalStore
      .patchProfile({ name })
      .pipe(take(1))
      .subscribe((ok) => {
        this.saving.set(false);
        const key = ok ? 'PROFILE_SNACK_SAVED' : 'PROFILE_SNACK_ERR';
        const dict = this.translate.translationsSub$.getValue();
        this.snackBar.open(dict[key] || key, undefined, { duration: 3200 });
      });
  }
}
