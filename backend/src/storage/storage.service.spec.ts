import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { crc32, deflateSync } from 'node:zlib';
import { StorageService } from './storage.service';

const ENV: Record<string, unknown> = {
  STORAGE_ENDPOINT: 'localhost',
  STORAGE_PORT: 8333,
  STORAGE_USE_SSL: false,
  STORAGE_ACCESS_KEY: 'test',
  STORAGE_SECRET_KEY: 'test',
  STORAGE_BUCKET: 'test',
  JWT_ACCESS_SECRET: 'secreto-de-prueba-acceso',
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

  it('una foto con demasiados píxeles no se confunde con un formato inválido', async () => {
    // Solo la cabecera de un PNG de 17000 × 17000: basta para leer sus dimensiones sin gastar memoria
    const chunk = (type: string, data: Buffer) => {
      const body = Buffer.concat([Buffer.from(type), data]);
      const len = Buffer.alloc(4);
      const crc = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(17000, 0);
    header.writeUInt32BE(17000, 4);
    header[8] = 8;
    header[9] = 2;
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(10))), chunk('IEND', Buffer.alloc(0)),
    ]);

    expect(await codeOf(service.uploadPublicPhoto({ buffer: png, size: png.length }))).toBe('IMAGE_DIMENSIONS');
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

describe('StorageService.uploadPrivateEvidence (HU-51, HU-60)', () => {
  let service: StorageService;
  let send: jest.SpyInstance;

  const codeOf = (promise: Promise<unknown>) =>
    promise.then(() => 'sin error', (err: HttpException) => (err.getResponse() as { code: string }).code);

  beforeEach(() => {
    service = new StorageService({ get: (key: string) => ENV[key] } as unknown as ConfigService);
    send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('un PDF (por su contenido) se guarda tal cual bajo private/', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%prueba\n');

    const key = await service.uploadPrivateEvidence('force-majeure', { buffer: pdf, size: pdf.length });

    expect(key).toMatch(/^private\/force-majeure\/[0-9a-f-]+\.pdf$/);
    expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({ Key: key, ContentType: 'application/pdf', Body: pdf });
  });

  it('una foto se reencoda a webp bajo private/', async () => {
    const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000000' } }).jpeg().toBuffer();

    const key = await service.uploadPrivateEvidence('force-majeure', { buffer: jpg, size: jpg.length });

    expect(key).toMatch(/^private\/force-majeure\/[0-9a-f-]+\.webp$/);
    expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({ ContentType: 'image/webp' });
  });

  it('rechaza otros formatos y más de 5 MB, sin subir nada', async () => {
    const txt = Buffer.from('no soy un pdf');

    expect(await codeOf(service.uploadPrivateEvidence('force-majeure', { buffer: txt, size: txt.length }))).toBe('INVALID_EVIDENCE');
    expect(await codeOf(service.uploadPrivateEvidence('force-majeure', { buffer: txt, size: 5 * 1024 * 1024 + 1 }))).toBe('EVIDENCE_TOO_LARGE');
  });
});

describe('StorageService enlaces firmados (HU-55, HU-60)', () => {
  const config = { get: (key: string) => ({ ...ENV, API_PUBLIC_URL: 'http://api' } as Record<string, unknown>)[key] };
  const service = new StorageService(config as never);
  let send: jest.SpyInstance;

  const photo = () => sharp({ create: { width: 20, height: 20, channels: 3, background: '#88aacc' } }).png().toBuffer();

  // Separa un enlace firmado en lo que recibe MediaController.getPrivate
  const partsOf = (url: string) => {
    const { pathname, searchParams } = new URL(url);
    const [, , , folder, file] = pathname.split('/');
    return [folder, file, searchParams.get('e')!, searchParams.get('s')!] as const;
  };

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Body: 'contenido', ContentType: 'image/webp' } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('la foto privada queda bajo private/<carpeta>/ y no tiene URL pública', async () => {
    const buffer = await photo();

    const key = await service.uploadPrivatePhoto('identity', { buffer, size: buffer.length });

    expect(key).toMatch(/^private\/identity\/[a-f0-9-]+\.webp$/);
    expect(service.publicUrl(key)).toBeNull();
    expect(service.signedUrl('public/abc.webp')).toBeNull();
  });

  it('un enlace firmado y vigente entrega el archivo', async () => {
    const url = service.signedUrl('private/identity/abc-123.webp')!;

    expect(url).toMatch(/^http:\/\/api\/media\/private\/identity\/abc-123\.webp\?e=\d+&s=[\w-]+$/);
    await expect(service.getPrivate(...partsOf(url))).resolves.toEqual({ body: 'contenido', contentType: 'image/webp' });
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'test', Key: 'private/identity/abc-123.webp' });
  });

  it('vencido, con otra firma, con la firma de otro archivo o con rutas raras, no entrega nada', async () => {
    const [folder, file, expires, signature] = partsOf(service.signedUrl('private/identity/abc-123.webp')!);
    const other = partsOf(service.signedUrl('private/identity/otro.webp')!);

    await expect(service.getPrivate(folder, file, expires, signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')))).resolves.toBeNull();
    await expect(service.getPrivate(folder, file, expires, other[3])).resolves.toBeNull();
    await expect(service.getPrivate(folder, file, String(Number(expires) + 300), signature)).resolves.toBeNull();
    await expect(service.getPrivate('..', file, expires, signature)).resolves.toBeNull();

    jest.spyOn(Date, 'now').mockReturnValue((Number(expires) + 1) * 1000);
    await expect(service.getPrivate(folder, file, expires, signature)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
