import type { FirebaseOptions } from 'firebase/app';

/**
 * Configuración pública de la app web en Firebase (Console → ⚙️ → General → Tus apps → Web).
 * Es la misma que genera el snippet `initializeApp(firebaseConfig)`; no incluyas aquí la cuenta de servicio.
 */
export const firebaseWebConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCLNcc5f__WGcSKXRUDKLKxEbQEOxwefko',
  authDomain: 'ecommerce-afcfb.firebaseapp.com',
  databaseURL: 'https://ecommerce-afcfb-default-rtdb.firebaseio.com',
  projectId: 'ecommerce-afcfb',
  storageBucket: 'ecommerce-afcfb.firebasestorage.app',
  messagingSenderId: '366975675227',
  appId: '1:366975675227:web:af64753cc98d0fa5a7087e',
  measurementId: 'G-YSBRQGD218',
};
