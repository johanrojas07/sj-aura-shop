import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { SignalStoreSelectors } from '../store/signal.store.selectors';
import { languages } from '../shared/constants';

function langFromRouterUrl(router: Router): string {
  const parts = router.url.split('?')[0].split('/').filter(Boolean);
  return parts[0] && languages.includes(parts[0]) ? parts[0] : languages[0];
}

/** Rutas que requieren sesión (p. ej. pedidos del usuario). */
export const AuthGuard: CanActivateFn = (): Observable<boolean | ReturnType<Router['createUrlTree']>> => {
  const selectors = inject(SignalStoreSelectors);
  const router = inject(Router);
  return combineLatest([toObservable(selectors.authLoading), toObservable(selectors.user)]).pipe(
    filter(([loading]) => !loading),
    take(1),
    map(([, user]) =>
      user?.email
        ? true
        : router.createUrlTree(['/', langFromRouterUrl(router), 'authorize', 'signin'], {
            queryParams: { returnUrl: router.url },
          }),
    ),
  );
};

/** Panel de administración: solo usuarios con rol `admin`. */
export const AdminGuard: CanActivateFn = (): Observable<boolean | ReturnType<Router['createUrlTree']>> => {
  const selectors = inject(SignalStoreSelectors);
  const router = inject(Router);
  const lang = langFromRouterUrl(router);
  return combineLatest([toObservable(selectors.authLoading), toObservable(selectors.user)]).pipe(
    filter(([loading]) => !loading),
    take(1),
    map(([, user]) => {
      if (!user?.email) {
        return router.createUrlTree(['/', lang, 'authorize', 'signin'], {
          queryParams: { returnUrl: router.url },
        });
      }
      if (user.roles?.includes('admin')) {
        return true;
      }
      return router.createUrlTree(['/', lang, 'product', 'all']);
    }),
  );
};

/**
 * Usuarios admin: un solo listado y detalle de pedidos en `/[lang]/dashboard/orders` (no duplicar `/[lang]/orders` de tienda).
 */
export const adminOrdersRedirectToDashboardGuard: CanActivateFn = (
  _route,
  state,
): Observable<boolean | ReturnType<Router['createUrlTree']>> => {
  const selectors = inject(SignalStoreSelectors);
  const router = inject(Router);
  return combineLatest([toObservable(selectors.authLoading), toObservable(selectors.user)]).pipe(
    filter(([loading]) => !loading),
    take(1),
    map(([, user]) => {
      if (!user?.roles?.includes('admin')) {
        return true;
      }
      const path = state.url.split('?')[0];
      const parts = path.split('/').filter(Boolean);
      const lang = parts[0] && languages.includes(parts[0]) ? parts[0] : languages[0];
      if (parts[1] !== 'orders') {
        return true;
      }
      const orderId = parts[2];
      if (orderId) {
        return router.createUrlTree(['/', lang, 'dashboard', 'orders', orderId]);
      }
      return router.createUrlTree(['/', lang, 'dashboard', 'orders']);
    }),
  );
};
