import { AdminService } from './admin.service';

describe('E14 AdminService', () => {
  it('el resumen cuenta reclamos activos, verificaciones pendientes y fuerzas mayores pendientes', async () => {
    const prisma = {
      claims: { count: jest.fn().mockResolvedValue(3) },
      identity_verifications: { count: jest.fn().mockResolvedValue(2) },
      cancellations: { count: jest.fn().mockResolvedValue(1) },
    };

    await expect(new AdminService(prisma as never).summary()).resolves.toEqual({ reclamos: 3, verificaciones: 2, fuerzaMayor: 1 });
    expect(prisma.claims.count.mock.calls[0][0].where).toEqual({
      claim_statuses: { status_name: { in: ['abierto', 'en_revision', 'informacion_solicitada'] } },
    });
  });
});
