import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { apiError } from '../common/errors';

/** HU-11, HU-19: fotos JPG o PNG de máximo 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_FORMATS = new Set(['jpeg', 'png']);
/** Límite por defecto de sharp (16383 × 16383): más que cualquier cámara de celular. */
const MAX_IMAGE_PIXELS = 0x3fff * 0x3fff;

/** Prefijo de las fotos que se muestran sin sesión (perfil, evidencias); se sirven por /media. */
export const PUBLIC_PREFIX = 'public/';
export const PUBLIC_FILE = /^[a-z0-9-]+\.webp$/;

/** HU-19.3: fotos de evidencias retiradas. Se conservan, pero /media no las sirve. */
export const WITHDRAWN_PREFIX = 'withdrawn/';

@Injectable()
export class StorageService {

  private client: S3Client;
  private bucket: string;

  constructor(private config: ConfigService) {

    this.bucket = this.config.get('STORAGE_BUCKET')!;
    const protocol = this.config.get('STORAGE_USE_SSL') ? 'https' : 'http';

    this.client = new S3Client({

      endpoint: `${protocol}://${this.config.get('STORAGE_ENDPOINT')}:${this.config.get('STORAGE_PORT')}`,
      region: 'us-east-1',
      credentials: {

        accessKeyId: this.config.get('STORAGE_ACCESS_KEY')!,
        secretAccessKey: this.config.get('STORAGE_SECRET_KEY')!,
      },

      forcePathStyle: true,
    });

  }

  async uploadImage(key: string, buffer: Buffer) {

    // rotate() aplica la orientación EXIF y, al reencodar, se descartan los metadatos (GPS incluido)
    const optimized = await sharp(buffer).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    await this.client.send(new PutObjectCommand({

      Bucket: this.bucket,
      Key: key,
      Body: optimized,
      ContentType: 'image/webp',
    }));
    
    return key;
  }

  /**
   * Valida una foto pública (formato real por su contenido, no por la extensión ni el mimetype que manda
   * el navegador), la guarda optimizada y devuelve su clave.
   */
  async uploadPublicPhoto(file: { buffer: Buffer; size: number } | undefined) {

    if (!file) throw apiError(HttpStatus.BAD_REQUEST, 'PHOTO_REQUIRED', 'Adjunta una foto.');

    if (file.size > MAX_IMAGE_BYTES) {

      throw apiError(HttpStatus.BAD_REQUEST, 'IMAGE_TOO_LARGE', 'La foto puede pesar máximo 5 MB.');
    }

    // Sin el límite de píxeles al leer la cabecera: así una foto enorme no se confunde con un formato inválido
    const meta = await sharp(file.buffer, { limitInputPixels: false }).metadata().catch(() => undefined);

    if (!meta?.format || !IMAGE_FORMATS.has(meta.format)) {

      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_IMAGE', 'La foto debe ser JPG o PNG.');
    }

    if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_IMAGE_PIXELS) {

      throw apiError(HttpStatus.BAD_REQUEST, 'IMAGE_DIMENSIONS', 'La foto tiene una resolución demasiado alta. Redúcela e inténtalo de nuevo.');
    }

    return this.uploadImage(`${PUBLIC_PREFIX}${randomUUID()}.webp`, file.buffer);
  }

  async getPublic(file: string): Promise<Readable | null> {

    if (!PUBLIC_FILE.test(file)) return null;

    try {

      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `${PUBLIC_PREFIX}${file}` }));
      return res.Body as Readable;

    } catch {

      return null;
    }
  }

  /** Copia una foto pública a la zona de retiradas y devuelve la clave nueva. El original lo borra quien llama. */
  async copyToWithdrawn(key: string) {

    const target = `${WITHDRAWN_PREFIX}${key.slice(PUBLIC_PREFIX.length)}`;

    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${key}`, Key: target }));

    return target;
  }

  async remove(key: string) {

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined);
  }

  /** URL pública de una clave guardada en la base (null si no hay foto). */
  publicUrl(key: string | null | undefined) {

    if (!key?.startsWith(PUBLIC_PREFIX)) return null;

    return `${this.config.get<string>('API_PUBLIC_URL')}/media/${key.slice(PUBLIC_PREFIX.length)}`;
  }
}
