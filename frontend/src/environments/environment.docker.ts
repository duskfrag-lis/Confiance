// Build para Docker: la API se sirve en el mismo origen (/api) a través de nginx.
export const environment = {
  production: true,
  apiUrl: '/api',
  recaptchaSiteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', // clave de prueba de Google
};
