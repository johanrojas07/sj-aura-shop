import * as admin from 'firebase-admin';

/** Convierte Timestamps de Firestore a milisegundos para el JSON de la API. */
export function deserializeFirestore<T = Record<string, unknown>>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (data instanceof admin.firestore.Timestamp) {
    return data.toMillis() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((x) => deserializeFirestore(x)) as unknown as T;
  }
  if (typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = deserializeFirestore(v as Record<string, unknown>);
    }
    return out as T;
  }
  return data;
}

export function docWithId<T = Record<string, unknown>>(
  doc: admin.firestore.DocumentSnapshot,
): (T & { _id: string }) | null {
  if (!doc.exists) {
    return null;
  }
  return { _id: doc.id, ...deserializeFirestore(doc.data() as T) } as T & {
    _id: string;
  };
}
