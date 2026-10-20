import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  CATALOG_MAX_PAGE_SIZE, LISTING_STATE_KEYS, MAX_PRICE, NEED_STATE_KEYS, type ListingStateKey, type NeedStateKey,
} from '../publications.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * HU-21 / HU-22. En la creación llega como multipart (las fotos van en el campo `fotos`), por eso los precios
 * se convierten de texto a número. Que el máximo sea mayor o igual que el mínimo lo revisa el servicio.
 */
export class ListingDto {

  @ApiProperty({ maxLength: 150, example: 'Instalación de lámparas y tomas' })
  @Transform(trim)
  @IsString({ message: 'Escribe el título de la publicación.' })
  @IsNotEmpty({ message: 'Escribe el título de la publicación.' })
  @MaxLength(150, { message: 'El título puede tener máximo 150 caracteres.' })
  titulo: string;

  @ApiProperty({ description: 'Uno de los oficios del perfil del prestador (HU-14)', example: '7' })
  @Matches(/^\d+$/, { message: 'Elige un oficio del catálogo.' })
  oficioId: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString({ message: 'Describe el servicio.' })
  @IsNotEmpty({ message: 'Describe el servicio.' })
  @MaxLength(1000, { message: 'La descripción puede tener máximo 1000 caracteres.' })
  descripcion: string;

  @ApiProperty({ description: 'Pesos colombianos, sin decimales', example: 50000 })
  @Type(() => Number)
  @IsInt({ message: 'El precio mínimo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El precio mínimo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio puede ser de máximo $30.000.000.' })
  precioMin: number;

  @ApiProperty({ description: 'Pesos colombianos, sin decimales. Igual al mínimo = precio fijo', example: 80000 })
  @Type(() => Number)
  @IsInt({ message: 'El precio máximo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El precio máximo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio puede ser de máximo $30.000.000.' })
  precioMax: number;
}

/** HU-25.2 */
export class MyListingsQuery {

  @ApiPropertyOptional({ enum: LISTING_STATE_KEYS })
  @IsOptional()
  @IsIn(LISTING_STATE_KEYS, { message: 'Estado inválido: usa activo, pausado, rechazado o retirado.' })
  estado?: ListingStateKey;
}

/** HU-27.4: `categoriaId` puede ser una categoría (incluye todos sus oficios, D-55) o un oficio. */
export class CatalogQuery {

  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Categoría inválida.' })
  categoriaId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Página inválida.' })
  @Min(1, { message: 'Página inválida.' })
  pagina?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: CATALOG_MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tamaño de página inválido.' })
  @Min(1, { message: 'Tamaño de página inválido.' })
  @Max(CATALOG_MAX_PAGE_SIZE, { message: `El tamaño de página es de máximo ${CATALOG_MAX_PAGE_SIZE}.` })
  tamano?: number;
}

/**
 * HU-26. Llega como multipart (fotos opcionales en `fotos`). Que la fecha sea futura y que el presupuesto máximo
 * sea mayor o igual que el mínimo lo revisa el servicio. El presupuesto usa el mismo tope que los precios (HU-21).
 */
export class NeedDto {

  @ApiProperty({ maxLength: 150, example: 'Cambio de breaker' })
  @Transform(trim)
  @IsString({ message: 'Escribe el título de la necesidad.' })
  @IsNotEmpty({ message: 'Escribe el título de la necesidad.' })
  @MaxLength(150, { message: 'El título puede tener máximo 150 caracteres.' })
  titulo: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString({ message: 'Describe lo que necesitas.' })
  @IsNotEmpty({ message: 'Describe lo que necesitas.' })
  @MaxLength(1000, { message: 'La descripción puede tener máximo 1000 caracteres.' })
  descripcion: string;

  @ApiProperty({ description: 'Oficio del catálogo (segundo nivel, D-55)', example: '4' })
  @Matches(/^\d+$/, { message: 'Elige un oficio del catálogo.' })
  oficioId: string;

  @ApiProperty({ description: 'Barrio del catálogo de zonas (la comuna sale del barrio)', example: '3' })
  @Matches(/^\d+$/, { message: 'Elige un barrio del catálogo.' })
  barrioId: string;

  @ApiProperty({ maxLength: 255, description: 'Solo la ve el prestador seleccionado (HU-30)', example: 'Calle 10 # 5-20' })
  @Transform(trim)
  @IsString({ message: 'Escribe la dirección exacta.' })
  @IsNotEmpty({ message: 'Escribe la dirección exacta.' })
  @MaxLength(255, { message: 'La dirección puede tener máximo 255 caracteres.' })
  direccion: string;

  @ApiProperty({ description: 'ISO 8601 con zona horaria', example: '2026-10-27T19:00:00-05:00' })
  @IsISO8601({ strict: true }, { message: 'Elige una fecha y hora válidas.' })
  // Con hora y zona explícitas: sin zona, el servidor la leería en su hora local y no en la de Colombia
  @Matches(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, { message: 'Elige una fecha y hora válidas.' })
  fechaPreferida: string;

  @ApiProperty({ description: 'Pesos colombianos, sin decimales', example: 40000 })
  @Type(() => Number)
  @IsInt({ message: 'El presupuesto mínimo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El presupuesto mínimo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El presupuesto puede ser de máximo $30.000.000.' })
  presupuestoMin: number;

  @ApiProperty({ description: 'Pesos colombianos, sin decimales', example: 90000 })
  @Type(() => Number)
  @IsInt({ message: 'El presupuesto máximo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El presupuesto máximo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El presupuesto puede ser de máximo $30.000.000.' })
  presupuestoMax: number;
}

/** HU-26: mis necesidades, filtro opcional por estado. */
export class MyNeedsQuery {

  @ApiPropertyOptional({ enum: NEED_STATE_KEYS })
  @IsOptional()
  @IsIn(NEED_STATE_KEYS, { message: 'Estado inválido: usa abierta, prestador_seleccionado o cerrada.' })
  estado?: NeedStateKey;
}

/** HU-28.2: filtro por oficio (o categoría, D-55) y por zona (comuna o barrio). */
export class NeedsBoardQuery extends CatalogQuery {

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Comuna inválida.' })
  comunaId?: string;

  @ApiPropertyOptional({ example: '3' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Barrio inválido.' })
  barrioId?: string;
}
