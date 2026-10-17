import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { StorageService } from './storage.service';

const ENV: Record<string, unknown> = {
  STORAGE_ENDPOINT: 'localhost',
  STORAGE_PORT: 8333,
  STORAGE_USE_SSL: false,
  STORAGE_ACCESS_KEY: 'test',
  STORAGE_SECRET_KEY: 'test',
  STORAGE_BUCKET: 'test',
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: { get: (key: string) => ENV[key] } },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('arma el endpoint con protocolo, host y puerto', async () => {
    const client = (service as unknown as { client: S3Client }).client;
    const endpoint = await client.config.endpoint!();

    expect(endpoint).toMatchObject({ protocol: 'http:', hostname: 'localhost', port: 8333 });
  });

  it('sube la imagen al bucket de STORAGE_BUCKET', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ffffff' },
    }).png().toBuffer();

    await service.uploadImage('prueba.webp', png);

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toMatchObject({ Bucket: 'test', Key: 'prueba.webp' });
  });
});

describe('StorageService.uploadPublicPhoto (HU-11, HU-19)', () => {
  const config = { get: (key: string) => ({ ...ENV, API_PUBLIC_URL: 'http://api' } as Record<string, unknown>)[key] };
  const service = new StorageService(config as never);
  const codeOf = (promise: Promise<unknown>) =>
    promise.then(
      () => 'sin error',
      (err: HttpException) => (err.getResponse() as { code: string }).code,
    );

  const image = (format: 'png' | 'jpeg' | 'webp') =>
    sharp({ create: { width: 20, height: 20, channels: 3, background: '#88aacc' } })[format]().toBuffer();

  beforeEach(() => jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never));
  afterEach(() => jest.restoreAllMocks());

  it.each(['png', 'jpeg'] as const)('acepta %s y lo guarda como webp público', async (format) => {
    const buffer = await image(format);

    const key = await service.uploadPublicPhoto({ buffer, size: buffer.length });

    expect(key).toMatch(/^public\/[a-f0-9-]+\.webp$/);
    expect(service.publicUrl(key)).toBe(`http://api/media/${key.slice('public/'.length)}`);
  });

  it('rechaza otros formatos aunque digan ser imagen', async () => {
    const webp = await image('webp');

    expect(await codeOf(service.uploadPublicPhoto({ buffer: webp, size: webp.length }))).toBe('INVALID_IMAGE');
    expect(await codeOf(service.uploadPublicPhoto({ buffer: Buffer.from('no soy una foto'), size: 15 }))).toBe('INVALID_IMAGE');
  });

  it('rechaza fotos de más de 5 MB y la falta de foto', async () => {
    expect(await codeOf(service.uploadPublicPhoto({ buffer: Buffer.alloc(1), size: 5 * 1024 * 1024 + 1 }))).toBe('IMAGE_TOO_LARGE');
    expect(await codeOf(service.uploadPublicPhoto(undefined))).toBe('PHOTO_REQUIRED');
  });

  it('solo sirve nombres de archivo públicos válidos', async () => {
    await expect(service.getPublic('../secreto.pdf')).resolves.toBeNull();
    expect(service.publicUrl('privado/doc.webp')).toBeNull();
  });
});
