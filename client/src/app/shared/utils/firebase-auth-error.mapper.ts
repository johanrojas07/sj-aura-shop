/**
 * Claves para `TranslatePipe` / Firestore (TEXTOS) a partir de códigos Firebase Auth.
 */
export function firebaseAuthErrorKey(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'AUTH_ERR_GENERIC';
  }
  const code = 'code' in err && typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : '';
  switch (code) {
    case 'app/firebase-not-configured':
      return 'AUTH_ERR_FIREBASE_NOT_CONFIGURED';
    case 'app/auth-not-browser':
      return 'AUTH_ERR_AUTH_NOT_BROWSER';
    case 'auth/invalid-email':
      return 'AUTH_ERR_INVALID_EMAIL';
    case 'auth/user-disabled':
      return 'AUTH_ERR_USER_DISABLED';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'AUTH_ERR_WRONG_CREDENTIALS';
    case 'auth/too-many-requests':
      return 'AUTH_ERR_TOO_MANY_REQUESTS';
    case 'auth/email-already-in-use':
      return 'AUTH_ERR_EMAIL_IN_USE';
    case 'auth/weak-password':
      return 'AUTH_ERR_WEAK_PASSWORD';
    case 'auth/network-request-failed':
      return 'AUTH_ERR_NETWORK';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'AUTH_ERR_POPUP_CLOSED';
    case 'auth/operation-not-allowed':
      return 'AUTH_ERR_OPERATION_NOT_ALLOWED';
    default:
      return 'AUTH_ERR_GENERIC';
  }
}
