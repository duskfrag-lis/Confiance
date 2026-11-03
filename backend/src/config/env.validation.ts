import { z } from 'zod';

/** Clave secreta de prueba pública de Google: acepta cualquier token. Solo sirve en desarrollo. */
const RECAPTCHA_TEST_SECRET = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

const WOMPI_KEYS = [
    ['WOMPI_PUBLIC_KEY', 'pub'],
    ['WOMPI_PRIVATE_KEY', 'prv'],
    ['WOMPI_INTEGRITY_SECRET', 'integrity'],
    ['WOMPI_EVENTS_SECRET', 'events'],
] as const;

const wompiPrefix = (kind: string, env: 'sandbox' | 'production') => {
    const tag = env === 'sandbox' ? 'test' : 'prod';
    return kind === 'pub' || kind === 'prv' ? `${kind}_${tag}_` : `${tag}_${kind}_`;
};

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

    WOMPI_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    WOMPI_PUBLIC_KEY: z.string().default(''),
    WOMPI_PRIVATE_KEY: z.string().default(''),
    WOMPI_INTEGRITY_SECRET: z.string().default(''),
    WOMPI_EVENTS_SECRET: z.string().default(''),
}).superRefine((env, ctx) => {
    for (const [key, kind] of WOMPI_KEYS) {
        const prefix = wompiPrefix(kind, env.WOMPI_ENV);
        if (env[key] && !env[key].startsWith(prefix)) {
            ctx.addIssue({ code: 'custom', path: [key], message: `Con WOMPI_ENV=${env.WOMPI_ENV}, ${key} debe empezar por ${prefix}.` });
        }
    }
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