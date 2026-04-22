import { BadRequestException, Injectable } from '@nestjs/common';

import { Translation } from './translation.model';
import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';
import { languages } from '../shared/constans';

const allowedLang = (lang: string): boolean => languages.includes(lang as (typeof languages)[number]);

@Injectable()
export class TranslationsService {
  constructor(private readonly firebase: FirebaseService) {}

  private col() {
    return this.firebase.firestore.collection(COL.translations);
  }

  async findByLang(lang: string): Promise<Translation | null> {
    if (!allowedLang(lang)) {
      return null;
    }
    return this.firebase.readQuietly(`translations.doc(${lang})`, async () => {
      const snap = await this.col().doc(lang).get();
      if (!snap.exists) return null;
      return docWithId<Translation>(snap)!;
    }, null);
  }

  async findAll(): Promise<Translation[]> {
    return this.firebase.readQuietly('translations.all', async () => {
      const snap = await this.col().get();
      return snap.docs
        .map((d) => docWithId<Translation>(d)!)
        .filter((t) => allowedLang(t.lang));
    }, []);
  }

  async upsertTranslation(lang: string, keys: Record<string, unknown>): Promise<void> {
    if (!allowedLang(lang)) {
      throw new BadRequestException(`Unsupported language: ${lang}. Allowed: ${languages.join(', ')}`);
    }
    await this.col().doc(lang).set({ lang, keys }, { merge: true });
  }

  async updateAll(translations: Translation[]): Promise<void> {
    const batch = this.firebase.firestore.batch();
    for (const t of translations) {
      if (!allowedLang(t.lang)) {
        continue;
      }
      batch.set(this.col().doc(t.lang), { lang: t.lang, keys: t.keys }, { merge: true });
    }
    await batch.commit();
  }
}
