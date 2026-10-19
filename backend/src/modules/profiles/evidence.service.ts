import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_PREFIX, StorageService } from '../../storage/storage.service';
import type { CreateEvidenceDto } from './dto/profiles.dto';
import { EvidenceStatus, MAX_EVIDENCE_PHOTOS } from './profiles.constants';

type Upload = { buffer: Buffer; size: number };

/** HU-19 · Evidencias de trabajos realizados. */
@Injectable()
export class EvidenceService {

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** Las del propio prestador, también las retiradas (marcadas), de la más reciente a la más antigua. */
  async listOwn(userId: bigint) {

    const rows = await this.prisma.work_evidence.findMany({
      where: { provider_profiles: { user_id: userId } },
      include: { evidence_statuses: true, work_evidence_photos: { orderBy: { work_evidence_photo_id: 'asc' } } },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((e) => ({ ...this.format(e), retirada: e.evidence_statuses.status_name === EvidenceStatus.WITHDRAWN }));
  }

  /** HU-19.1 y 19.2: de 1 a 5 fotos JPG/PNG (5 MB c/u) y una descripción; se publica al instante. */
  async create(userId: bigint, dto: CreateEvidenceDto, files: Upload[] | undefined) {

    if (!files?.length || files.length > MAX_EVIDENCE_PHOTOS) {

      throw apiError(HttpStatus.BAD_REQUEST, 'EVIDENCE_PHOTOS', 'Adjunta entre 1 y 5 fotos del trabajo.');
    }

    const [profile, status] = await Promise.all([
      this.prisma.provider_profiles.findUniqueOrThrow({ where: { user_id: userId }, select: { provider_profile_id: true } }),
      this.prisma.evidence_statuses.findUniqueOrThrow({ where: { status_name: EvidenceStatus.PUBLISHED } }),
    ]);

    const keys: string[] = [];

    try {

      // Se validan y suben una por una; si alguna falla, se borran las que ya se subieron
      for (const file of files) keys.push(await this.storage.uploadPublicPhoto(file));

      const evidence = await this.prisma.work_evidence.create({
        data: {
          provider_profile_id: profile.provider_profile_id,
          description: dto.descripcion,
          status_id: status.evidence_status_id,
          work_evidence_photos: { create: keys.map((photo_url) => ({ photo_url })) },
        },
        include: { work_evidence_photos: { orderBy: { work_evidence_photo_id: 'asc' } } },
      });

      return { ...this.format(evidence), retirada: false };

    } catch (err) {

      await Promise.all(keys.map((k) => this.storage.remove(k)));
      throw err;
    }
  }

  /**
   * HU-19.3: deja de mostrarse pero se conserva; la base impide volver a publicarla. Sus fotos pasan a la
   * zona de retiradas para que el enlace directo (/media) deje de funcionar. Se copian antes de tocar la
   * base y los originales se borran al final: si algo falla a mitad, la evidencia sigue completa.
   * Repetirla con una ya retirada termina de mover las fotos que hayan quedado públicas.
   */
  async withdraw(userId: bigint, evidenceId: bigint) {

    const evidence = await this.prisma.work_evidence.findFirst({
      where: { work_evidence_id: evidenceId, provider_profiles: { user_id: userId } },
      include: { evidence_statuses: true, work_evidence_photos: true },
    });

    if (!evidence) throw new NotFoundException();

    const photos = evidence.work_evidence_photos.filter((p) => p.photo_url.startsWith(PUBLIC_PREFIX));
    const alreadyWithdrawn = evidence.evidence_statuses.status_name === EvidenceStatus.WITHDRAWN;

    if (alreadyWithdrawn && !photos.length) return;

    const withdrawn = await this.prisma.evidence_statuses.findUniqueOrThrow({ where: { status_name: EvidenceStatus.WITHDRAWN } });

    const copies: string[] = [];

    try {

      for (const photo of photos) copies.push(await this.storage.copyToWithdrawn(photo.photo_url));

      await this.prisma.$transaction([
        this.prisma.work_evidence.update({
          where: { work_evidence_id: evidenceId },
          data: { status_id: withdrawn.evidence_status_id },
        }),
        ...photos.map((photo, i) => this.prisma.work_evidence_photos.update({
          where: { work_evidence_photo_id: photo.work_evidence_photo_id },
          data: { photo_url: copies[i] },
        })),
      ]);

    } catch (err) {

      await Promise.all(copies.map((k) => this.storage.remove(k)));
      throw err;
    }

    await Promise.all(photos.map((p) => this.storage.remove(p.photo_url)));
  }

  /** Publicadas de un prestador, para su perfil público (HU-20). */
  async listPublished(providerProfileId: bigint) {

    const rows = await this.prisma.work_evidence.findMany({
      where: { provider_profile_id: providerProfileId, evidence_statuses: { status_name: EvidenceStatus.PUBLISHED } },
      include: { work_evidence_photos: { orderBy: { work_evidence_photo_id: 'asc' } } },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((e) => this.format(e));
  }

  private format(e: { work_evidence_id: bigint; description: string; created_at: Date; work_evidence_photos: { photo_url: string }[] }) {

    return {
      id: String(e.work_evidence_id),
      descripcion: e.description,
      fecha: e.created_at.toISOString(),
      // Las retiradas no tienen URL pública (HU-19.3), y tampoco las claves que no son de /media
      fotos: e.work_evidence_photos.map((p) => this.storage.publicUrl(p.photo_url)).filter((url) => url !== null),
    };
  }
}
