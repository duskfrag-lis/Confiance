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
