// Sube las imágenes de muestra de database/seeds/dev_seed.sql al bucket de STORAGE_BUCKET (solo desarrollo).
// Uso, desde backend/: npm run seed:media
import 'dotenv/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// Claves públicas del seed (public/…) y el color de cada imagen de muestra
const PHOTOS = {
  'public/seed-evidence-1-a.webp': '#4a7fb5',
  'public/seed-listing-1-a.webp': '#3f9a6e',
};

const protocol = process.env.STORAGE_USE_SSL === 'true' ? 'https' : 'http';
const client = new S3Client({
  endpoint: `${protocol}://${process.env.STORAGE_ENDPOINT}:${process.env.STORAGE_PORT}`,
  region: 'us-east-1',
  credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY, secretAccessKey: process.env.STORAGE_SECRET_KEY },
  forcePathStyle: true,
});

for (const [key, background] of Object.entries(PHOTOS)) {

  const body = await sharp({ create: { width: 800, height: 600, channels: 3, background } }).webp({ quality: 80 }).toBuffer();
  await client.send(new PutObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key, Body: body, ContentType: 'image/webp' }));
  console.log(`subida ${key}`);
}
