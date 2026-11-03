import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsString, Matches } from 'class-validator';
import { PSE_DOCUMENT_TYPES, type PseDocumentType } from '../payments.constants';

/** HU-44.3 y HU-44.4: el prestador dice si la transferencia llegó o no. */
export class ConfirmTransferDto {

  @ApiProperty({ example: true, description: 'true si el dinero llegó a la cuenta; false si no llegó' })
  @IsBoolean({ message: 'Indica si la transferencia llegó (true o false).' })
  recibida: boolean;
}

/** HU-43: datos que PSE pide del pagador, el banco elegido y la aceptación de los términos de Wompi. */
export class StartPseDto {

  @ApiProperty({ example: '1', description: 'Código del banco (GET /payments/pse/banks). En sandbox, 1 aprueba y 2 rechaza.' })
  @IsString({ message: 'Elige tu banco.' })
  @Matches(/^\d{1,10}$/, { message: 'Elige tu banco.' })
  banco: string;

  @ApiProperty({ enum: ['natural', 'juridica'] })
  @IsIn(['natural', 'juridica'], { message: 'Indica si pagas como persona natural o jurídica.' })
  tipoPersona: 'natural' | 'juridica';

  @ApiProperty({ enum: PSE_DOCUMENT_TYPES })
  @IsIn(PSE_DOCUMENT_TYPES, { message: 'Elige el tipo de documento.' })
  tipoDocumento: PseDocumentType;

  @ApiProperty({ example: '1099888777' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value))
  @IsString({ message: 'Escribe el número de documento.' })
  @Matches(/^[A-Za-z0-9]{5,15}$/, { message: 'El documento debe tener entre 5 y 15 letras o números.' })
  documento: string;

  @ApiProperty({ example: true, description: 'El cliente leyó y aceptó los términos y la autorización de datos de Wompi' })
  @Equals(true, { message: 'Acepta los términos de Wompi para continuar.' })
  aceptaTerminos: boolean;
}
