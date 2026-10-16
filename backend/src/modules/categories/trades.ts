import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authError } from '../auth/auth.constants';

type CategoriesClient = { categories: Pick<Prisma.TransactionClient['categories'], 'count'> };

export async function assertTrades(prisma: CategoriesClient, ids: number[]): Promise<void> {

  if (!ids.length) return;

  const found = await prisma.categories.count({
    where: { category_id: { in: ids }, parent_category_id: { not: null }, is_active: true },
  });

  if (found !== ids.length) {

    throw authError(HttpStatus.BAD_REQUEST, 'INVALID_CATEGORY', 'Alguno de los oficios no existe o no está disponible.');
  }
}
