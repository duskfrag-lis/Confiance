import { ConversationApi, groupByPerson, personKey } from './chat.models';

const conv = (over: Partial<ConversationApi> & { id: string }): ConversationApi => ({
  contratacionId: over.id,
  servicio: 'Paseo de perros',
  estado: 'aceptado',
  fechaHora: '2026-11-10T09:00:00.000Z',
  contraparte: { id: '11', nombre: 'Paola Rendón', fotoUrl: null },
  ultimoMensaje: null,
  sinLeer: 0,
  soloLectura: false,
  ...over,
});

describe('chat agrupado por persona', () => {
  it('una sola fila por persona, con la suma de no leídos', () => {
    const groups = groupByPerson([
      conv({ id: '1', sinLeer: 2 }),
      conv({ id: '2', sinLeer: 1 }),
      conv({ id: '3', contraparte: { id: '12', nombre: 'Luz Gutiérrez', fotoUrl: null } }),
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].threads.length).toBe(2);
    expect(groups[0].sinLeer).toBe(3);
  });

  it('primero las abiertas (la próxima cita primero) y luego las cerradas (la más reciente primero)', () => {
    const [g] = groupByPerson([
      conv({ id: 'cerrada-vieja', soloLectura: true, estado: 'cancelado', fechaHora: '2026-11-01T09:00:00.000Z' }),
      conv({ id: 'abierta-tarde', fechaHora: '2026-11-20T09:00:00.000Z' }),
      conv({ id: 'cerrada-nueva', soloLectura: true, estado: 'completado', fechaHora: '2026-11-05T09:00:00.000Z' }),
      conv({ id: 'abierta-pronto', fechaHora: '2026-11-08T09:00:00.000Z' }),
    ]);
    expect(g.threads.map((t) => t.contratacionId)).toEqual(['abierta-pronto', 'abierta-tarde', 'cerrada-nueva', 'cerrada-vieja']);
    expect(g.soloLectura).toBe(false);
  });

  it('la vista previa sale de la conversación con el mensaje más reciente', () => {
    const [g] = groupByPerson([
      conv({ id: '1', ultimoMensaje: { texto: 'viejo', fecha: '2026-11-01T10:00:00.000Z', mio: true } }),
      conv({ id: '2', ultimoMensaje: { texto: 'nuevo', fecha: '2026-11-02T10:00:00.000Z', mio: false } }),
    ]);
    expect(g.latest.ultimoMensaje?.texto).toBe('nuevo');
  });

  it('sin id de la persona, agrupa por nombre y foto', () => {
    const a = conv({ id: '1', contraparte: { nombre: 'Santiago Gómez', fotoUrl: null } });
    const b = conv({ id: '2', contraparte: { nombre: 'Santiago Gómez', fotoUrl: null } });
    expect(personKey(a)).toBe(personKey(b));
    expect(groupByPerson([a, b]).length).toBe(1);
  });
});
