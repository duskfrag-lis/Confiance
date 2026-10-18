import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import type { BankAccountDto } from './dto/profiles.dto';
import { ACCOUNT_TYPES, BANK_VISIBLE_STATES, accountTypeKeyOf } from './profiles.constants';

/** HU-18 · Información bancaria del prestador. */
@Injectable()
export class BankAccountService {

  constructor(private prisma: PrismaService) {}

  /**
   * HU-18.1: el prestador siempre puede consultarla. null si aún no la registró. `editable` es false
   * mientras tenga contrataciones en curso (D-58), para que la interfaz bloquee el formulario.
   */
  async getOwn(userId: bigint) {

    const { provider_profile_id } = await this.providerOf(userId);

    const account = await this.prisma.provider_bank_accounts.findUnique({
      where: { provider_profile_id },
      include: { bank_account_types: true },
    });

    if (!account) return null;

    return { ...this.format(account), editable: !(await this.inProcess(provider_profile_id)) };
  }

  /**
   * El correo verificado (D-57) lo exige VerifiedEmailGuard en el controlador.
   * D-58: con una contratación de ACEPTADO a FINALIZADO los datos quedan fijos, porque el cliente ya los
   * ve y puede estar transfiriendo. Registrarla por primera vez sí se permite: no cambia nada que el
   * cliente haya visto y le abre el pago por transferencia (HU-18.5).
   */
  async upsert(userId: bigint, dto: BankAccountDto) {

    const { provider_profile_id } = await this.providerOf(userId);

    const [type, current] = await Promise.all([
      this.prisma.bank_account_types.findUniqueOrThrow({ where: { type_name: ACCOUNT_TYPES[dto.tipoCuenta] } }),
      this.prisma.provider_bank_accounts.findUnique({ where: { provider_profile_id } }),
    ]);

    const data = { bank_name: dto.banco, account_type_id: type.account_type_id, account_number: dto.numero };

    const changed = current !== null && (
      current.bank_name !== data.bank_name
      || current.account_type_id !== data.account_type_id
      || current.account_number !== data.account_number
    );

    if (changed && (await this.inProcess(provider_profile_id))) {

      throw apiError(
        HttpStatus.CONFLICT,
        'BANK_ACCOUNT_LOCKED',
        'No puedes cambiar tu información bancaria mientras tengas contrataciones en curso. Podrás hacerlo cuando terminen.',
      );
    }

    const account = await this.prisma.provider_bank_accounts.upsert({
      where: { provider_profile_id },
      create: { provider_profile_id, ...data },
      update: data,
      include: { bank_account_types: true },
    });

    return { ...this.format(account), editable: !(await this.inProcess(provider_profile_id)) };
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

  /** D-58: alguna contratación del prestador en un estado donde el cliente ve sus datos bancarios. */
  private async inProcess(providerProfileId: bigint) {

    const open = await this.prisma.service_requests.count({
      where: { provider_profile_id: providerProfileId, request_statuses: { status_name: { in: BANK_VISIBLE_STATES } } },
    });

    return open > 0;
  }

  private async providerOf(userId: bigint) {

    return this.prisma.provider_profiles.findUniqueOrThrow({
      where: { user_id: userId },
      select: { provider_profile_id: true },
    });
  }

  private format(account: { bank_name: string; account_number: string; bank_account_types: { type_name: string } }) {

    return {
      banco: account.bank_name,
      tipoCuenta: accountTypeKeyOf(account.bank_account_types.type_name),
      numero: account.account_number,
    };
  }
}
