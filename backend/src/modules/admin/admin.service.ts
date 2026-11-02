import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_CLAIM_STATES } from '../claims/claims.constants';

/** E14 · Inicio del panel del administrador: lo que tiene pendiente en cada sección. */
@Injectable()
export class AdminService {

  constructor(private prisma: PrismaService) {}

  async summary() {

    const [reclamos, verificaciones, fuerzaMayor] = await Promise.all([
      this.prisma.claims.count({ where: { claim_statuses: { status_name: { in: ACTIVE_CLAIM_STATES } } } }),
      this.prisma.identity_verifications.count({ where: { verification_statuses: { status_name: 'pending' } } }),
      this.prisma.cancellations.count({ where: { is_force_majeure: true, force_majeure_statuses: { status_name: 'pending' } } }),
    ]);

    return { reclamos, verificaciones, fuerzaMayor };
  }
}
