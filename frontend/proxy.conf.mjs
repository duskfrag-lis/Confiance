// ng serve reenvía /api al backend para que las imágenes de /api/media carguen desde el mismo origen.
// En Docker (docker-compose.dev.yml) el backend se llama `backend`; en local, localhost.
export default {
  '/api': {
    target: process.env['API_TARGET'] ?? 'http://localhost:3000',
    secure: false,
  },
};
