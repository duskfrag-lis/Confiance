import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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

/** HU-60: archivos privados (evidencias de fuerza mayor, documentos). /media no los sirve; se entregan con autorización. */
export const PRIVATE_PREFIX = 'private/';
const PRIVATE_FOLDER = /^[a-z-]+$/;
const PRIVATE_FILE = /^[a-z0-9-]+\.(webp|pdf)$/;

/**
 * HU-60: un enlace firmado a un archivo privado dura entre 10 y 15 minutos. El vencimiento se redondea a bloques de
 * 5 minutos para que el mismo archivo tenga el mismo enlace un rato y el navegador lo pueda guardar en caché.
 */
const SIGNED_URL_SECONDS = 10 * 60;
const SIGNED_URL_STEP = 5 * 60;

@Injectable()
export class StorageService {

  private client: S3Client;
  private bucket: string;
  private signingKey: Buffer;

  constructor(private config: ConfigService) {

    this.bucket = this.config.get('STORAGE_BUCKET')!;
    // Clave propia de los enlaces, derivada del secreto de sesión: un enlace no sirve como token ni al revés
    this.signingKey = createHmac('sha256', this.config.get<string>('JWT_ACCESS_SECRET')!).update('private-media').digest();
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

    await this.assertPhoto(file);

    return this.uploadImage(`${PUBLIC_PREFIX}${randomUUID()}.webp`, file.buffer);
  }

  /** HU-55 (y HU-60): foto privada, con las mismas reglas que una pública. Devuelve su clave bajo `private/<folder>/`. */
  async uploadPrivatePhoto(folder: string, file: { buffer: Buffer; size: number }) {

    await this.assertPhoto(file);

    return this.uploadImage(`${PRIVATE_PREFIX}${folder}/${randomUUID()}.webp`, file.buffer);
  }

  private async assertPhoto(file: { buffer: Buffer; size: number }) {

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
  /**
   * HU-60: archivo privado detrás de un enlace firmado y vigente. Quien llama a signedUrl() ya revisó quién puede
   * verlo; aquí solo se comprueba que el enlace sea el que se firmó y que no haya vencido.
   */
  async getPrivate(folder: string, file: string, expires: string, signature: string) {

    if (!PRIVATE_FOLDER.test(folder) || !PRIVATE_FILE.test(file) || !/^\d+$/.test(expires)) return null;
    if (Number(expires) * 1000 < Date.now()) return null;

    const key = `${PRIVATE_PREFIX}${folder}/${file}`;
    const expected = Buffer.from(this.sign(key, expires));
    const given = Buffer.from(signature);

    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    try {

      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { body: res.Body as Readable, contentType: res.ContentType ?? 'application/octet-stream' };

    } catch {

      return null;
    }
  }

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

  /** HU-60: enlace de corta duración a un archivo privado (null si la clave no es privada). Solo para quien puede verlo. */
  signedUrl(key: string | null | undefined) {

    if (!key?.startsWith(PRIVATE_PREFIX)) return null;

    const now = Math.floor(Date.now() / 1000);
    const expires = String(Math.ceil((now + SIGNED_URL_SECONDS) / SIGNED_URL_STEP) * SIGNED_URL_STEP);

    return `${this.config.get<string>('API_PUBLIC_URL')}/media/${key}?e=${expires}&s=${this.sign(key, expires)}`;
  }

  private sign(key: string, expires: string) {

    return createHmac('sha256', this.signingKey).update(`${key}\n${expires}`).digest('base64url');
  }
}
