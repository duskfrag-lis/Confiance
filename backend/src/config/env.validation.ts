import { z } from 'zod';

export const envSchema = z.object({

    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    CORS_ORIGIN: z.string(),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(10),
    JWT_ACCESS_EXPIRES: z.string(),
    JWT_REFRESH_SECRET: z.string().min(10),
    JWT_REFRESH_EXPIRES: z.string(),
    MINIO_ENDPOINT: z.string(),
    MINIO_PORT: z.coerce.number(),
    MINIO_USE_SSL: z.coerce.boolean(),
    MINIO_ACCESS_KEY: z.string(),
    MINIO_SECRET_KEY: z.string(),
    MINIO_BUCKET: z.string(),
    RESEND_API_KEY: z.string(),
});

export function validateEnv(config: Record<string, unknown>) {

    const parsed = envSchema.safeParse(config);

    if (!parsed.success) {

        throw new Error(`Variables de entorno inválidas: ${parsed.error.message}`);
    }

    return parsed.data;
}