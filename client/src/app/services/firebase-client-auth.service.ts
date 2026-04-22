import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  type Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type UserCredential,
} from 'firebase/auth';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FirebaseClientAuthService {
  private readonly platformId = inject(PLATFORM_ID);

  private getAuthInstance(): Auth {
    if (!isPlatformBrowser(this.platformId)) {
      throw Object.assign(new Error('Auth solo en navegador'), { code: 'app/auth-not-browser' });
    }
    const cfg = environment.firebase;
    if (!cfg?.apiKey) {
      throw Object.assign(new Error('Firebase no configurado'), { code: 'app/firebase-not-configured' });
    }
    let app: FirebaseApp;
    if (!getApps().length) {
      app = initializeApp(cfg);
    } else {
      app = getApps()[0]!;
    }
    return getAuth(app);
  }

  signInWithEmail(email: string, password: string): Promise<UserCredential> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(Object.assign(new Error('Auth solo en navegador'), { code: 'app/auth-not-browser' }));
    }
    if (!this.isFirebaseConfigured()) {
      return Promise.reject(Object.assign(new Error('Firebase no configurado'), { code: 'app/firebase-not-configured' }));
    }
    return signInWithEmailAndPassword(this.getAuthInstance(), email, password);
  }

  signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(Object.assign(new Error('Auth solo en navegador'), { code: 'app/auth-not-browser' }));
    }
    if (!this.isFirebaseConfigured()) {
      return Promise.reject(Object.assign(new Error('Firebase no configurado'), { code: 'app/firebase-not-configured' }));
    }
    return createUserWithEmailAndPassword(this.getAuthInstance(), email, password);
  }

  signInWithGoogle(): Promise<UserCredential> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(Object.assign(new Error('Auth solo en navegador'), { code: 'app/auth-not-browser' }));
    }
    if (!this.isFirebaseConfigured()) {
      return Promise.reject(Object.assign(new Error('Firebase no configurado'), { code: 'app/firebase-not-configured' }));
    }
    return signInWithPopup(this.getAuthInstance(), new GoogleAuthProvider());
  }

  async signOut(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (!getApps().length) {
      return;
    }
    await signOut(getAuth(getApps()[0]!));
  }

  isFirebaseConfigured(): boolean {
    return !!environment.firebase?.apiKey;
  }
}
