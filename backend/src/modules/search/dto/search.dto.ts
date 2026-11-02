import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CatalogQuery } from '../../publications/dto/publications.dto';
import { MAX_PRICE } from '../../publications/publications.constants';

const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value;

/**
 * HU-31 y HU-33. `categoriaId`, `pagina` y `tamano` funcionan como en el catálogo (HU-27): una categoría incluye
 * todos sus oficios (D-55). Todos los filtros son opcionales y se combinan (HU-33.2).
 */
export class SearchQuery extends CatalogQuery {

  @ApiPropertyOptional({ description: 'Texto: busca en el título, la descripción y el oficio, sin distinguir mayúsculas ni tildes', example: 'fuga cocina' })
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString({ message: 'Escribe qué buscas.' })
  @MaxLength(100, { message: 'La búsqueda puede tener máximo 100 caracteres.' })
  q?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Comuna inválida.' })
  comunaId?: string;

  @ApiPropertyOptional({ example: '3' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Barrio inválido.' })
  barrioId?: string;

  @ApiPropertyOptional({ description: 'Pesos colombianos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El precio mínimo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El precio mínimo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio puede ser de máximo $30.000.000.' })
  precioMin?: number;

  @ApiPropertyOptional({ description: 'Pesos colombianos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El precio máximo debe ser un valor en pesos, sin decimales.' })
  @Min(0, { message: 'El precio máximo no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio puede ser de máximo $30.000.000.' })
  precioMax?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La calificación mínima va de 1 a 5.' })
  @Min(1, { message: 'La calificación mínima va de 1 a 5.' })
  @Max(5, { message: 'La calificación mínima va de 1 a 5.' })
  calificacionMin?: number;

  @ApiPropertyOptional({ description: 'Día en hora de Colombia (AAAA-MM-DD), de hoy en adelante', example: '2026-10-27' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Elige una fecha válida.' })
  @IsISO8601({ strict: true }, { message: 'Elige una fecha válida.' })
  fecha?: string;

  @ApiPropertyOptional({ description: 'Solo prestadores con la insignia de verificado' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value))
  @IsBoolean({ message: 'soloVerificados debe ser true o false.' })
  soloVerificados?: boolean;
}
