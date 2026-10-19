import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CATALOG_MAX_PAGE_SIZE, LISTING_STATE_KEYS, MAX_PRICE, type ListingStateKey } from '../publications.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * HU-21 / HU-22. En la creación llega como multipart (las fotos van en el campo `fotos`), por eso los precios
 * se convierten de texto a número. Que el máximo sea mayor o igual que el mínimo lo revisa el servicio.
 */
export class ListingDto {

  @ApiProperty({ maxLength: 150, example: 'Instalación de lámparas y tomas' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escribe el título de la publicación.' })
  @MaxLength(150, { message: 'El título puede tener máximo 150 caracteres.' })
  titulo: string;

  @ApiProperty({ description: 'Oficio del catálogo (segundo nivel, D-55)', example: '7' })
  @Matches(/^\d+$/, { message: 'Elige un oficio del catálogo.' })
  oficioId: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Describe el servicio.' })
  @MaxLength(1000, { message: 'La descripción puede tener máximo 1000 caracteres.' })
  descripcion: string;

  @ApiProperty({ description: 'Pesos colombianos, sin decimales', example: 50000 })
  @Type(() => Number)
  @IsInt({ message: 'El precio mínimo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El precio mínimo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio mínimo es demasiado alto.' })
  precioMin: number;

  @ApiProperty({ description: 'Pesos colombianos, sin decimales. Igual al mínimo = precio fijo', example: 80000 })
  @Type(() => Number)
  @IsInt({ message: 'El precio máximo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El precio máximo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio máximo es demasiado alto.' })
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
