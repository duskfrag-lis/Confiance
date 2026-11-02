import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { VerificationService } from './verification.service';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'sin error',
    (err: HttpException) => (err.getResponse() as { code?: string }).code ?? err.getStatus(),
  );

const STATUS_IDS: Record<string, number> = { pending: 1, approved: 2, rejected: 3, correction_requested: 4 };

describe('E13 VerificationService', () => {
  let prisma: any;
  let storage: any;
  let notifications: any;
  let service: VerificationService;

  const photo = { buffer: Buffer.from('foto'), size: 4 };

  const row = (status: string, extra: object = {}) => ({
    identity_verification_id: 11n, document_number: '1020304050', additional_info: null, reviewed_by: null,
    review_notes: null, created_at: new Date('2026-10-20T15:00:00Z'), updated_at: new Date('2026-10-20T15:00:00Z'),
    document_types: { document_type_id: 1, type_name: 'cedula' },
    verification_statuses: { status_name: status },
    identity_verification_photos: [{ photo_url: 'private/identity/a.webp' }],
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      provider_profiles: { findUnique: jest.fn().mockResolvedValue({ provider_profile_id: 4n }) },
      document_types: {
        findUnique: jest.fn().mockResolvedValue({ document_type_id: 1, type_name: 'cedula' }),
        findMany: jest.fn().mockResolvedValue([{ document_type_id: 1, type_name: 'cedula' }]),
      },
      verification_statuses: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ verification_status_id: STATUS_IDS[where.status_name] })),
      },
      identity_verifications: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ identity_verification_id: 12n }),
        update: jest.fn().mockResolvedValue({ updated_at: new Date('2026-10-24T18:00:00Z') }),
      },
      audit_events: { create: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    storage = {
      uploadPrivatePhoto: jest.fn((folder: string) => Promise.resolve(`private/${folder}/nueva.webp`)),
      remove: jest.fn(),
      signedUrl: (key: string) => `firmado:${key}`,
      publicUrl: () => null,
    };
    notifications = { notify: jest.fn() };
    service = new VerificationService(prisma, storage, notifications);
  });

  describe('HU-55 prestador', () => {
    it('sin solicitudes, el estado es sin_enviar', async () => {
      await expect(service.mine(2n)).resolves.toEqual({ estado: 'sin_enviar', actual: null, anteriores: [] });
    });

    it('el estado sale de la más reciente, con su motivo y fotos con enlace firmado (HU-55.4, HU-60)', async () => {
      prisma.identity_verifications.findMany.mockResolvedValue([
        row('correction_requested', { reviewed_by: 1n, review_notes: 'La foto está borrosa.', updated_at: new Date('2026-10-21T15:00:00Z') }),
        row('rejected', { identity_verification_id: 10n }),
      ]);

      const result = await service.mine(2n);

      expect(result.estado).toBe('correccion');
      expect(result.actual).toMatchObject({
        id: '11', tipoDocumento: { id: '1', nombre: 'Cédula de ciudadanía' }, motivo: 'La foto está borrosa.',
        fotos: ['firmado:private/identity/a.webp'], revisada: '2026-10-21T15:00:00.000Z',
      });
      expect(result.anteriores.map((a) => a.id)).toEqual(['10']);
    });

    it('queda pendiente, con las fotos en la carpeta privada y la cédula sin puntos (HU-55.2)', async () => {
      await service.submit(2n, { tipoDocumento: '1', numero: '1.020.304.050', informacion: null }, [photo, photo]);

      expect(storage.uploadPrivatePhoto).toHaveBeenCalledWith('identity', photo);
      expect(prisma.identity_verifications.create.mock.calls[0][0].data).toEqual({
        provider_profile_id: 4n, document_type_id: 1, document_number: '1020304050', additional_info: null, status_id: 1,
        identity_verification_photos: { create: [{ photo_url: 'private/identity/nueva.webp' }, { photo_url: 'private/identity/nueva.webp' }] },
      });
      // HU-61
      expect(prisma.audit_events.create.mock.calls[0][0].data).toEqual({
        actor_id: 2n, event_type: 'verification_submitted', entity_type: 'identity_verification', entity_id: 12n, new_state: 'pending',
      });
    });

    it('valida las fotos, el tipo y el número antes de subir nada', async () => {
      const send = (numero: string, files?: typeof photo[]) => codeOf(service.submit(2n, { tipoDocumento: '1', numero }, files));

      expect(await send('1020304050')).toBe('PHOTOS_REQUIRED');
      expect(await send('1020304050', Array(6).fill(photo))).toBe('VERIFICATION_PHOTOS');
      expect(await send('12.345', [photo])).toBe('INVALID_DOCUMENT_NUMBER');

      prisma.document_types.findUnique.mockResolvedValue(null);
      expect(await send('1020304050', [photo])).toBe('INVALID_DOCUMENT_TYPE');
      expect(storage.uploadPrivatePhoto).not.toHaveBeenCalled();
    });

    it('con una pendiente o ya verificado no se envía otra (HU-55.3)', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({ verification_statuses: { status_name: 'pending' } });
      expect(await codeOf(service.submit(2n, { tipoDocumento: '1', numero: '1020304050' }, [photo]))).toBe('VERIFICATION_PENDING');

      prisma.identity_verifications.findFirst.mockResolvedValue({ verification_statuses: { status_name: 'approved' } });
      expect(await codeOf(service.submit(2n, { tipoDocumento: '1', numero: '1020304050' }, [photo]))).toBe('ALREADY_VERIFIED');
    });

    it('tras un rechazo sí se envía una nueva (HU-55.4)', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({ verification_statuses: { status_name: 'rejected' } });

      expect(await codeOf(service.submit(2n, { tipoDocumento: '1', numero: '1020304050' }, [photo]))).toBe('sin error');
    });

    it('si la base frena una segunda pendiente (envíos cruzados), VERIFICATION_PENDING y se borran las fotos', async () => {
      prisma.identity_verifications.create.mockRejectedValue(new Error('Ya hay una solicitud de verificación pendiente (provider_profile_id = 4)'));

      expect(await codeOf(service.submit(2n, { tipoDocumento: '1', numero: '1020304050' }, [photo]))).toBe('VERIFICATION_PENDING');
      expect(storage.remove).toHaveBeenCalledWith('private/identity/nueva.webp');
    });
  });

  describe('HU-58 administrador', () => {
    const current = (status = 'pending', userId = 2n) => ({
      verification_statuses: { status_name: status }, provider_profiles: { user_id: userId },
    });

    it('lista las pendientes de la más antigua a la más reciente, con ayudas para revisar (HU-58.1)', async () => {
      prisma.identity_verifications.findMany.mockResolvedValue([{
        ...row('pending'),
        provider_profiles: {
          users: { first_name: 'Pedro', last_name: 'Plomero', profile_photo_url: null, id_number: '1020304050' },
          _count: { identity_verifications: 3 },
        },
      }]);

      const [item] = await service.pending();

      expect(prisma.identity_verifications.findMany.mock.calls[0][0]).toMatchObject({
        where: { verification_statuses: { status_name: 'pending' } },
        orderBy: [{ created_at: 'asc' }, { identity_verification_id: 'asc' }],
      });
      expect(item).toMatchObject({ id: '11', prestador: { nombre: 'Pedro Plomero' }, coincideConRegistro: true, anteriores: 2 });
      expect(item).not.toHaveProperty('estado');
      expect(JSON.stringify(item)).not.toContain('id_number');
    });

    it('aprobar registra al administrador y avisa al prestador (HU-58.4)', async () => {
      prisma.identity_verifications.findUnique.mockResolvedValue(current());

      await expect(service.review(1n, 11n, { decision: 'aprobada' })).resolves.toEqual({
        id: '11', estado: 'aprobada', revisada: '2026-10-24T18:00:00.000Z',
      });
      expect(prisma.identity_verifications.update.mock.calls[0][0].data).toEqual({ status_id: 2, reviewed_by: 1n, review_notes: null });
      expect(prisma.audit_events.create.mock.calls[0][0].data).toEqual({
        actor_id: 1n, event_type: 'verification_reviewed', entity_type: 'identity_verification', entity_id: 11n, previous_state: 'pending', new_state: 'approved',
      });
      expect(notifications.notify.mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 2n, type: 'verification_result' })]);
    });

    it('rechazar o pedir corrección exige el motivo y lo envía al prestador (HU-58.3)', async () => {
      prisma.identity_verifications.findUnique.mockResolvedValue(current());

      expect(await codeOf(service.review(1n, 11n, { decision: 'rechazada' }))).toBe('REASON_REQUIRED');
      expect(await codeOf(service.review(1n, 11n, { decision: 'correccion', motivo: null }))).toBe('REASON_REQUIRED');

      await service.review(1n, 11n, { decision: 'correccion', motivo: 'Falta el reverso' });
      expect(prisma.identity_verifications.update.mock.calls[0][0].data).toEqual({ status_id: 4, reviewed_by: 1n, review_notes: 'Falta el reverso' });
      expect(notifications.notify.mock.calls[0][0][0].message).toContain('Falta el reverso. Envía');
    });

    it('ya revisada, propia o inexistente: no se cambia nada', async () => {
      prisma.identity_verifications.findUnique.mockResolvedValue(current('approved'));
      expect(await codeOf(service.review(1n, 11n, { decision: 'aprobada' }))).toBe('VERIFICATION_REVIEWED');

      prisma.identity_verifications.findUnique.mockResolvedValue(current('pending', 1n));
      await expect(service.review(1n, 11n, { decision: 'aprobada' })).rejects.toBeInstanceOf(ForbiddenException);

      prisma.identity_verifications.findUnique.mockResolvedValue(null);
      await expect(service.review(1n, 11n, { decision: 'aprobada' })).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.identity_verifications.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
