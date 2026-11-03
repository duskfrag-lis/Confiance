import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { dbRuleTranslator, lockRequest, requestState, summaryOf } from '../contracting/contract-tx';
import type { RateDto } from './dto/reputation.dto';

const alreadyRated = () => apiError(HttpStatus.CONFLICT, 'ALREADY_RATED', 'Ya calificaste esta contratación.');

const translateDbRule = dbRuleTranslator([
  ['Solo se puede calificar una contratación COMPLETADA', requestState],
]);

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * E10 · Reputación: calificar a la otra parte (HU-49). La base también exige COMPLETADO y que se califique a la
 * contraparte (fn_check_rating) y una sola vez por persona y contratación (UNIQUE); los promedios por rol salen de
 * las vistas v_provider_rating_summary y v_client_rating_summary.
 */
@Injectable()
export class ReputationService {

  constructor(private prisma: PrismaService) {}

  /** HU-49.1 y HU-49.2: solo en COMPLETADO, una vez, y siempre a la otra parte de la contratación. */
  async rate(userId: bigint, requestId: bigint, dto: RateDto) {

    return this.prisma.$transaction(async (tx) => {

      const { request, side } = await lockRequest(tx, userId, requestId);

      if (request.request_statuses.status_name !== 'completado') throw requestState();

      await tx.ratings.create({
        data: {
          service_request_id: requestId,
          rated_by: userId,
          rated_user_id: side === 'client' ? request.provider_profiles.user_id : request.client_id,
          score: dto.puntaje,
          comment: dto.comentario ?? null,
        },
      });

      return summaryOf(request, 'completado');
    }).catch((err) => { throw isUniqueViolation(err) ? alreadyRated() : translateDbRule(err); });
  }
}
