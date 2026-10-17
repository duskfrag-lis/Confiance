import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import type { BankAccountDto } from './dto/profiles.dto';
import { ACCOUNT_TYPES, BANK_VISIBLE_STATES, accountTypeKeyOf } from './profiles.constants';

/** HU-18 · Información bancaria del prestador. */
@Injectable()
export class BankAccountService {

  constructor(private prisma: PrismaService) {}

  /** HU-18.1: el prestador siempre puede consultarla. null si aún no la registró. */
  async getOwn(userId: bigint) {

    const account = await this.prisma.provider_bank_accounts.findFirst({
      where: { provider_profiles: { user_id: userId } },
      include: { bank_account_types: true },
    });

    return account ? this.format(account) : null;
  }

  /**
   * D-57: registrarla o editarla exige el correo verificado, para que quien crea una cuenta con un
   * correo ajeno no pueda dejar ahí sus datos. Cuando se fusione la PR #15 esto pasa a VerifiedEmailGuard.
   */
  async upsert(userId: bigint, dto: BankAccountDto) {

    const user = await this.prisma.users.findUniqueOrThrow({
      where: { user_id: userId },
      select: { email_verified: true, provider_profiles: { select: { provider_profile_id: true } } },
    });

    if (!user.email_verified) {

      throw apiError(HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED', 'Verifica tu correo para registrar tu información bancaria.');
    }

    const type = await this.prisma.bank_account_types.findUniqueOrThrow({
      where: { type_name: ACCOUNT_TYPES[dto.tipoCuenta] },
    });

    const data = { bank_name: dto.banco, account_type_id: type.account_type_id, account_number: dto.numero };
    const provider_profile_id = user.provider_profiles!.provider_profile_id;

    const account = await this.prisma.provider_bank_accounts.upsert({
      where: { provider_profile_id },
      create: { provider_profile_id, ...data },
      update: data,
      include: { bank_account_types: true },
    });

    return this.format(account);
  }

  /**
   * HU-18.2 y 18.3: el cliente la ve solo mientras tiene con ese prestador una contratación en ACEPTADO,
   * CONFIRMADO, EN_CURSO o FINALIZADO. La visibilidad la decide el backend, no la interfaz.
   * HU-18.5: si el prestador no la tiene, `null` (el cliente solo puede pagar por PSE).
   */
  async getForClient(clientId: bigint, providerProfileId: bigint) {

    const contract = await this.prisma.service_requests.count({
      where: {
        client_id: clientId,
        provider_profile_id: providerProfileId,
        request_statuses: { status_name: { in: BANK_VISIBLE_STATES } },
      },
    });

    if (!contract) {

      throw apiError(
        HttpStatus.FORBIDDEN,
        'BANK_ACCOUNT_HIDDEN',
        'Los datos bancarios se muestran solo mientras tienes una contratación aceptada con este prestador.',
      );
    }

    const account = await this.prisma.provider_bank_accounts.findUnique({
      where: { provider_profile_id: providerProfileId },
      include: { bank_account_types: true },
    });

    return account ? this.format(account) : null;
  }

  private format(account: { bank_name: string; account_number: string; bank_account_types: { type_name: string } }) {

    return {
      banco: account.bank_name,
      tipoCuenta: accountTypeKeyOf(account.bank_account_types.type_name),
      numero: account.account_number,
    };
  }
}
