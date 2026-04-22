import { BadRequestException, Injectable } from '@nestjs/common';
import * as cloudinary from 'cloudinary';
import * as streamifier from 'streamifier';

import { Product } from '../products/models/product.model';
import { Images } from './utils/images';
import { AddProductImageDto } from './dto/add-image.dto';
import { ImageDto } from './dto/image.dto';
import { ProductsService } from '../products/products.service';
import { FirebaseService } from '../firebase/firebase.service';

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

/**
 * Imágenes en borrador para el formulario de producto (SPA con Bearer).
 * Antes se guardaban en `express-session`; ahora por `firebaseUid` para no depender de cookies entre orígenes.
 */
@Injectable()
export class AdminService {
  private readonly imageBuckets = new Map<string, { all: string[] }>();

  constructor(
    private readonly productsService: ProductsService,
    private readonly firebaseService: FirebaseService,
  ) {}

  private getImagesForUser(uid: string): Images {
    const raw = this.imageBuckets.get(uid);
    const all = raw?.all?.length ? [...raw.all] : [];
    return new Images({ all });
  }

  private persistImages(uid: string, images: Images): void {
    this.imageBuckets.set(uid, { all: [...images.all] });
  }

  getImages(uid: string): Promise<Images> {
    return Promise.resolve(this.getImagesForUser(uid));
  }

  async addImage(
    uid: string,
    imageDto: ImageDto,
    addImageDto: AddProductImageDto,
  ): Promise<Images | Product> {
    const { image } = imageDto;
    const { titleUrl } = addImageDto;
    const existImages = this.getImagesForUser(uid);
    const product = titleUrl
      ? await this.productsService.appendProductImage(titleUrl, image)
      : null;

    if (!product) {
      existImages.add(image);
      this.persistImages(uid, existImages);
    }

    return product || existImages;
  }

  async uploadImage(
    uid: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    addImageDto: AddProductImageDto,
  ): Promise<Images | Product> {
    const { titleUrl } = addImageDto;
    const existImages = this.getImagesForUser(uid);
    const image = await this.resolveUploadedImageUrl(file);

    const product = titleUrl
      ? await this.productsService.appendProductImage(titleUrl, image)
      : null;

    if (!product) {
      existImages.add(image);
      this.persistImages(uid, existImages);
    }

    return product || existImages;
  }

  async removeImage(
    uid: string,
    imageDto: ImageDto,
    addImageDto: AddProductImageDto,
  ): Promise<Images | Product> {
    const { image } = imageDto;
    const { titleUrl } = addImageDto;
    const existImages = this.getImagesForUser(uid);
    const product = titleUrl
      ? await this.productsService.removeProductImage(titleUrl, image)
      : null;

    existImages.remove(image);
    this.persistImages(uid, existImages);

    return product || existImages;
  }

  private cloudinaryConfigured(): boolean {
    return !!(
      process.env.CLOUDINARY_NAME &&
      process.env.CLOUDINARY_KEY &&
      process.env.CLOUDINARY_SECRET
    );
  }

  /** Por defecto Firebase Storage (plan gratuito); IMAGE_STORAGE=cloudinary fuerza Cloudinary. */
  private async resolveUploadedImageUrl(file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  }): Promise<string> {
    const forceCloudinary =
      (process.env.IMAGE_STORAGE || '').toLowerCase() === 'cloudinary';
    if (forceCloudinary) {
      if (!this.cloudinaryConfigured()) {
        throw new BadRequestException(
          'IMAGE_STORAGE=cloudinary pero faltan CLOUDINARY_NAME / KEY / SECRET.',
        );
      }
      return (await this.uploadToCloudinary(file)).secure_url;
    }
    if (this.firebaseService.isReady()) {
      try {
        return await this.firebaseService.uploadShopImage(file);
      } catch (err) {
        if (this.cloudinaryConfigured()) {
          return (await this.uploadToCloudinary(file)).secure_url;
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(
          `Subida a Firebase Storage falló (${msg}). Activa Storage en Google Cloud del mismo proyecto y revisa el bucket.`,
        );
      }
    }
    if (this.cloudinaryConfigured()) {
      return (await this.uploadToCloudinary(file)).secure_url;
    }
    throw new BadRequestException(
      'No hay almacenamiento de imágenes: usa Firebase Storage (mismas credenciales que Firestore) o configura CLOUDINARY_*.',
    );
  }

  private uploadToCloudinary(file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  }): Promise<{ secure_url: string }> {
    return new Promise((resolve, reject) => {
      const cld_upload_stream = cloudinary.v2.uploader.upload_stream(
        {
          resource_type: 'auto',
          use_filename: true,
        },
        (error: unknown, result: { secure_url?: string }) => {
          if (result?.secure_url) {
            resolve(result as { secure_url: string });
          } else {
            reject(error);
          }
        },
      );

      streamifier.createReadStream(file.buffer).pipe(cld_upload_stream);
    });
  }
}
