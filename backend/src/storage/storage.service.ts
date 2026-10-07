import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

@Injectable()
export class StorageService {

  private client: S3Client;
  private bucket: string;

  constructor(private config: ConfigService) {

    this.bucket = this.config.get('STORAGE_BUCKET2')!;
    const protocol = this.config.get('STORAGE_USE_SSL') ? 'https' : 'http';

    this.client = new S3Client({

      endpoint: `${protocol}:${this.config.get('STORAGE_ENDPOINT')}:${this.config.get('STORAGE_PORT')}`,
      region: 'us-east-1',
      credentials: {

        accessKeyId: this.config.get('STORAGE_ACCESS_KEY')!,
        secretAccessKey: this.config.get('STORAGE_SECRET_KEY')!,
      },

      forcePathStyle: true,
    });

  }

  async uploadImage(key: string, buffer: Buffer) {

    const optimized = await sharp(buffer).resize(1200).webp({ quality: 80 }).toBuffer();
    await this.client.send(new PutObjectCommand({

      Bucket: this.bucket,
      Key: key,
      Body: optimized,
      ContentType: 'image/webp',
    }));
    
    return key;
  }
}