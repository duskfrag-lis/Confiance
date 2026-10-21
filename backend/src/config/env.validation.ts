import { z } from 'zod';

/** Clave secreta de prueba pública de Google: acepta cualquier token. Solo sirve en desarrollo. */
const RECAPTCHA_TEST_SECRET = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

export const envSchema = z.object({

    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    CORS_ORIGIN: z.string(),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(10),
    JWT_ACCESS_EXPIRES: z.string(),
    JWT_REFRESH_SECRET: z.string().min(10),
    JWT_REFRESH_EXPIRES: z.string(),
    STORAGE_ENDPOINT: z.string(),
    STORAGE_PORT: z.coerce.number(),
    STORAGE_USE_SSL: z.stringbool(),
    STORAGE_ACCESS_KEY: z.string(),
    STORAGE_SECRET_KEY: z.string(),
    STORAGE_BUCKET: z.string(),

    RESEND_API_KEY: z.string(),
    FRONTEND_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.string().url(),
    MICROSOFT_CLIENT_ID: z.string().min(1),
    MICROSOFT_CLIENT_SECRET: z.string().min(1),
    MICROSOFT_CALLBACK_URL: z.string().url(),
    MICROSOFT_TENANT: z.string().default('consumers'),
    MAIL_FROM: z.string().default('Confiance <no-reply@confiance.app>'),

    API_PUBLIC_URL: z.string().url().default('http://localhost:3000/api'),
    RECAPTCHA_SECRET_KEY: z.string().min(1),
}).refine((env) => env.NODE_ENV !== 'production' || env.RECAPTCHA_SECRET_KEY !== RECAPTCHA_TEST_SECRET, {
    message: 'RECAPTCHA_SECRET_KEY es la clave de prueba de Google: en producción el captcha no protegería nada.',
    path: ['RECAPTCHA_SECRET_KEY'],
});

export function validateEnv(config: Record<string, unknown>) {

    const parsed = envSchema.safeParse(config);

    if (!parsed.success) {

        throw new Error(`Variables de entorno inválidas: ${parsed.error.message}`);
    }

    return parsed.data;
}