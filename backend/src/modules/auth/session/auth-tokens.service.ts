import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenTypeName } from '../auth.constants';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Tokens de un solo uso guardados en auth_tokens (verificación de correo, recuperación de
 * contraseña y sesiones). En la base solo queda el hash SHA-256; el valor en claro viaja
 * únicamente en el correo o en la cookie.
 */
@Injectable()
export class AuthTokensService {

  constructor(private prisma: PrismaService) {}

  static hash(raw: string) {

    return createHash('sha256').update(raw).digest('hex');
  }

  async issue(userId: bigint, type: TokenTypeName, ttlMs: number, db: Db = this.prisma) {

    const raw = randomBytes(32).toString('base64url');
    const tokenType = await db.token_types.findUniqueOrThrow({ where: { type_name: type } });

    await db.auth_tokens.create({
      data: {
        user_id: userId,
        token_type_id: tokenType.token_type_id,
        token_hash: AuthTokensService.hash(raw),
        expires_at: new Date(Date.now() + ttlMs),
      },
    });

    return raw;
  }

  /**
   * Marca el token como usado y devuelve su usuario. Es atómico: si dos peticiones llegan a la
   * vez con el mismo token, solo una lo consume. Devuelve null si no existe, venció o ya se usó.
   */
  async consume(raw: string, type: TokenTypeName) {

    const tokenHash = AuthTokensService.hash(raw);

    const { count } = await this.prisma.auth_tokens.updateMany({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
        token_types: { type_name: type },
      },
      data: { used_at: new Date() },
    });

    if (count === 0) return null;

    const token = await this.prisma.auth_tokens.findUniqueOrThrow({ where: { token_hash: tokenHash } });

    return token.user_id;
  }

  /** Usuario y fecha de uso si el token existió y ya había sido usado; null en otro caso. */
  async findUsed(raw: string, type: TokenTypeName) {

    const token = await this.prisma.auth_tokens.findFirst({
      where: { token_hash: AuthTokensService.hash(raw), token_types: { type_name: type } },
    });

    return token?.used_at ? { userId: token.user_id, usedAt: token.used_at } : null;
  }

  /** true si el usuario tiene un token vigente de ese tipo emitido desde `since` (p. ej. por una rotación). */
  async hasActiveSince(userId: bigint, type: TokenTypeName, since: Date) {

    const count = await this.prisma.auth_tokens.count({
      where: {
        user_id: userId,
        used_at: null,
        expires_at: { gt: new Date() },
        created_at: { gte: since },
        token_types: { type_name: type },
      },
    });

    return count > 0;
  }

  /** Invalida todos los tokens vigentes de un tipo (p. ej. cerrar todas las sesiones). */
  async revokeAll(userId: bigint, type: TokenTypeName, db: Db = this.prisma) {

    await db.auth_tokens.updateMany({
      where: { user_id: userId, used_at: null, token_types: { type_name: type } },
      data: { used_at: new Date() },
    });
  }
}
