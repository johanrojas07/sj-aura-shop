import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

import { sendMsg } from '../shared/utils/email/mailer';
import { ContactDto } from './dto/contact.dto';
import { PageDto } from './dto/page.dto';
import { Cart } from '../cart/utils/cart';
import { Page } from './models/page.model';
import { Theme } from './models/theme.model';
import { Config } from './models/config.model';
import { Translation } from '../translations/translation.model';
import { firstValueFrom } from 'rxjs';
import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';

@Injectable()
export class EshopService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly httpService: HttpService,
  ) {}

  private pages() {
    return this.firebase.firestore.collection(COL.pages);
  }
  private themes() {
    return this.firebase.firestore.collection(COL.themes);
  }
  private configs() {
    return this.firebase.firestore.collection(COL.configs);
  }
  private translations() {
    return this.firebase.firestore.collection(COL.translations);
  }

  async getConfig(session: { config?: Config } | undefined): Promise<{ config: string }> {
    const emptyB64 = Buffer.from(JSON.stringify({})).toString('base64');
    return this.firebase.readQuietly('eshop.getConfig', async () => {
      const q = await this.configs().where('active', '==', true).limit(1).get();
      const activeConfig = q.empty ? null : docWithId<Config>(q.docs[0]);

      if (activeConfig && session) {
        session.config = activeConfig;
      }
      try {
        const tq = await this.themes().where('active', '==', true).limit(1).get();
        const theme = tq.empty ? null : docWithId<Theme>(tq.docs[0]);
        const configFomEnvToFE = Object.keys(process.env)
          .filter((key) => key.includes('FE_'))
          .reduce((prev, curr) => ({ ...prev, [curr]: process.env[curr] }), {});
        const themeStyles =
          theme && theme.styles && Object.keys(theme.styles).length
            ? { styles: theme.styles }
            : {};

        return {
          config: Buffer.from(
            JSON.stringify({ ...configFomEnvToFE, ...themeStyles }),
          ).toString('base64'),
        };
      } catch {
        return { config: emptyB64 };
      }
    }, { config: emptyB64 });
  }

  async sendContact(
    contactDto: ContactDto,
    cart: Cart,
    lang: string,
  ): Promise<void> {
    const { token } = contactDto;
    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SERVER_KEY}&response=${token}`;

    const result = await firstValueFrom(this.httpService.post(url));
    if (result.data.success) {
      try {
        const snap = await this.translations().doc(lang).get();
        const translations = snap.exists
          ? (docWithId<Translation>(snap)! as Translation)
          : null;
        this.sendmail(contactDto.email, contactDto, cart, translations);

        if (process.env.ADMIN_EMAILS) {
          process.env.ADMIN_EMAILS.split(',')
            .filter(Boolean)
            .forEach((email) => {
              this.sendmail(email, contactDto, cart, translations);
            });
        }
      } catch {
        throw new BadRequestException();
      }
    } else {
      throw new BadRequestException();
    }
  }

  async getPages(lang: string, titles?: boolean): Promise<Page[]> {
    return this.firebase.readQuietly('eshop.getPages', async () => {
      const snap = await this.pages().get();
      return snap.docs.map((d) => {
        const p = docWithId<Page>(d)!;
        if (titles) {
          const langBlock = (p[lang] as { title?: string; contentHTML?: string }) || {};
          return {
            ...p,
            titleUrl: p.titleUrl,
            [lang]: {
              title: langBlock.title ?? '',
              contentHTML: langBlock.contentHTML ?? '',
            },
          } as Page;
        }
        return p;
      });
    }, []);
  }

  async getPage(titleUrl: string, lang: string): Promise<Page> {
    const snap = await this.pages().doc(titleUrl).get();
    if (!snap.exists) {
      throw new NotFoundException(`Page with title ${titleUrl} not found`);
    }
    return docWithId<Page>(snap)!;
  }

  async addOrEditPage(pageDto: PageDto): Promise<Page> {
    const { titleUrl } = pageDto;
    const ref = this.pages().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...pageDto, dateAdded: Date.now() });
    } else {
      await ref.set(pageDto, { merge: true });
    }
    const u = await ref.get();
    return docWithId<Page>(u)!;
  }

  async deletePage(titleUrl: string): Promise<void> {
    const ref = this.pages().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new NotFoundException(`Page with title ${titleUrl} not found`);
    }
    await ref.delete();
  }

  async getThemes(): Promise<Theme[]> {
    const snap = await this.themes().get();
    return snap.docs.map((d) => docWithId<Theme>(d)!);
  }

  async addOrEditTheme(themeDto: Record<string, unknown>): Promise<Theme> {
    const titleUrl = themeDto.titleUrl as string;
    const ref = this.themes().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...themeDto, dateAdded: Date.now() });
    } else {
      await ref.set(themeDto, { merge: true });
    }
    const u = await ref.get();
    return docWithId<Theme>(u)!;
  }

  async deleteTheme(titleUrl: string): Promise<void> {
    const ref = this.themes().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new NotFoundException(`Theme with title ${titleUrl} not found`);
    }
    await ref.delete();
  }

  async getConfigs(): Promise<Config[]> {
    const snap = await this.configs().get();
    return snap.docs.map((d) => docWithId<Config>(d)!);
  }

  async addOrEditConfig(configDto: Record<string, unknown>): Promise<Config> {
    const titleUrl = configDto.titleUrl as string;
    const ref = this.configs().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...configDto, dateAdded: Date.now() });
    } else {
      await ref.set(configDto, { merge: true });
    }
    const u = await ref.get();
    return docWithId<Config>(u)!;
  }

  async deleteConfig(titleUrl: string): Promise<void> {
    const ref = this.configs().doc(titleUrl);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new NotFoundException(`Config with title ${titleUrl} not found`);
    }
    await ref.delete();
  }

  private sendmail = async (
    email: string,
    contactDto: ContactDto,
    cart: Cart,
    translations: Translation | null,
  ) => {
    const emailType = {
      subject: 'Contact',
      cart,
      contact: contactDto,
      date: new Date(),
    };

    const mailSended = await sendMsg(email, emailType, translations);
    return mailSended;
  };
}
