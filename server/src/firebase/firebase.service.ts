import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private _firestore: admin.firestore.Firestore;
  private _auth: admin.auth.Auth;
  private initOk = false;

  onModuleInit(): void {
    const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL);
    const hasGacFile = Boolean(
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim(),
    );
    const hasServiceAccountJson = Boolean(
      (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim(),
    );
    const hasExplicitCredential = hasServiceAccountJson || hasGacFile;
    /* En Vercel, applicationDefault() sin clave termina con ADC que no aplica: la 1.ª operación
     * a Firestore puede colgar o tardar > timeout del serverless (504) y CORS falsa. */
    if (isVercel && !hasExplicitCredential) {
      this.initOk = false;
      this.logger.error(
        '[Firebase] Vercel: define FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio) o GOOGLE_APPLICATION_CREDENTIALS. Sin eso, no se usa el SDK.',
      );
      return;
    }
    try {
      if (admin.apps.length === 0) {
        const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (keyPath && !path.isAbsolute(keyPath)) {
          const serverRoot = path.resolve(__dirname, '..', '..');
          process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
            serverRoot,
            keyPath,
          );
        }
        let credential: admin.credential.Credential;
        let credentialSource: string;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          credential = admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as admin.ServiceAccount,
          );
          credentialSource = 'FIREBASE_SERVICE_ACCOUNT';
        } else {
          credential = admin.credential.applicationDefault();
          credentialSource = process.env.GOOGLE_APPLICATION_CREDENTIALS
            ? `archivo: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`
            : 'application default';
        }
        const projectId =
          process.env.FIREBASE_PROJECT_ID ||
          process.env.GCLOUD_PROJECT ||
          undefined;
        const storageBucket =
          process.env.FIREBASE_STORAGE_BUCKET ||
          (projectId ? `${projectId}.firebasestorage.app` : undefined);
        admin.initializeApp({
          credential,
          ...(projectId && { projectId }),
          ...(storageBucket && { storageBucket }),
        });
        this.logger.log(
          `[Firebase] Inicializado (credenciales: ${credentialSource}, projectId: ${projectId ?? 'del JSON'})`,
        );
      }
      const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
      this._firestore = getFirestore(admin.app(), databaseId);
      this._auth = admin.auth();
      this.initOk = true;
    } catch (err: unknown) {
      this.initOk = false;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Firebase] Error al inicializar: ${message}`);
    }
  }

  isReady(): boolean {
    return this.initOk;
  }

  /**
   * Lectura a Firestore con fallback si falla (DB inexistente, permisos, red, etc.).
   */
  async readQuietly<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.initOk) {
      this.logger.warn(`[Firestore] ${label}: cliente no inicializado`);
      return fallback;
    }
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Firestore] ${label}: ${msg}`);
      return fallback;
    }
  }

  get firestore(): admin.firestore.Firestore {
    if (!this.initOk) {
      throw new Error('Firestore no está disponible.');
    }
    return this._firestore;
  }

  get auth(): admin.auth.Auth {
    if (!this.initOk) {
      throw new Error('Firebase Auth no está disponible.');
    }
    return this._auth;
  }

  getAdmin(): typeof admin {
    return admin;
  }

  getProjectId(): string | undefined {
    try {
      return admin.app().options.projectId;
    } catch {
      return undefined;
    }
  }

  /**
   * Sube un binario a Firebase Storage y devuelve URL de descarga con token (válida en el navegador).
   * Rutas bajo `eshop/` para reglas Storage. Requiere bucket configurado en Admin SDK.
   */
  async uploadShopImage(file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  }): Promise<string> {
    if (!this.initOk) {
      throw new Error('Firebase Admin no está inicializado.');
    }
    const bucketName = admin.app().options.storageBucket as string | undefined;
    if (!bucketName) {
      throw new Error(
        'Falta storageBucket (p. ej. FIREBASE_STORAGE_BUCKET o PROJECT_ID.firebasestorage.app en initializeApp).',
      );
    }
    const bucket = admin.storage().bucket(bucketName);
    const ext = path.extname(file.originalname) || '.jpg';
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80);
    const dest = `eshop/${Date.now()}-${safeBase}${ext}`;
    const token = randomUUID();
    const f = bucket.file(dest);
    await f.save(file.buffer, {
      metadata: {
        contentType: file.mimetype || 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });
    const encoded = encodeURIComponent(dest);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
  }

  async checkFirestoreConnection(): Promise<{ ok: boolean; message?: string }> {
    if (!this.initOk) {
      return { ok: false, message: 'Firebase Admin no inicializado.' };
    }
    try {
      await this._firestore.listCollections(); // valida conexión
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: number })?.code;
      if (message.includes('NOT_FOUND') || code === 5) {
        const projectId =
          process.env.FIREBASE_PROJECT_ID ||
          process.env.GCLOUD_PROJECT ||
          'tu-proyecto';
        const dbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
        return {
          ok: false,
          message: `Firestore no encontrado (databaseId=${dbId}). Crea la base en la consola: https://console.firebase.google.com/project/${projectId}/firestore`,
        };
      }
      if (message.includes('PERMISSION_DENIED') || message.includes('403')) {
        return {
          ok: false,
          message:
            'Sin permisos para Firestore. Revisa la cuenta de servicio y reglas.',
        };
      }
      return { ok: false, message: message || 'Error de conexión a Firestore.' };
    }
  }
}
