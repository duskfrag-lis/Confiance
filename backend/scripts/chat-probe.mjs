// Prueba manual del chat (HU-42): node scripts/chat-probe.mjs <access_token> <contratacionId>
import { io } from 'socket.io-client';

const [token, contratacionId] = process.argv.slice(2);

if (!token || !contratacionId) {
  console.log('Uso: node scripts/chat-probe.mjs <access_token> <contratacionId>');
  process.exit(1);
}

const socket = io('http://localhost:3000/chat', {
  path: '/api/socket.io',
  extraHeaders: { Cookie: `access_token=${token}` },
});

socket.on('connect', async () => {
  console.log('conectado', socket.id);
  try {
    console.log('unirse →', await socket.emitWithAck('unirse', { contratacionId }));
  } catch (err) {
    // Si el servidor corta la conexión (no autorizado), la confirmación nunca llega
    console.log('unirse falló:', err.message);
  }
});

socket.on('mensaje', (m) => console.log('mensaje nuevo:', m));
socket.on('no_autorizado', () => console.log('no autorizado'));
socket.on('disconnect', (reason) => console.log('desconectado:', reason));
