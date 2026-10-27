export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  recaptchaSiteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', // desarrollo
  // Simula los endpoints que el backend aún no tiene (E8 a E11); se apaga cuando existan
  mockApi: true,
  // Solo en desarrollo: localStorage 'confiance.mock.admin' = '1' marca la sesión como administrador para probar el panel
  mockAdmin: true,
};
