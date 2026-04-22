import { Component } from '@angular/core';
import { Observable } from 'rxjs';

import { TranslateService } from '../../../services/translate.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: false,
  templateUrl: './dashboard-layout.component.html',
  styleUrls: ['./dashboard-layout.component.scss'],
})
export class DashboardLayoutComponent {
  lang$: Observable<string>;

  constructor(public readonly translate: TranslateService) {
    this.lang$ = this.translate.getLang$();
  }
}
