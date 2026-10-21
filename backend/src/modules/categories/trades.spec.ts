import { assertTrades } from './trades';

describe('assertTrades (D-55)', () => {
  it('solo acepta oficios activos de segundo nivel cuya categoría también esté activa', async () => {
    const prisma = { categories: { count: jest.fn().mockResolvedValue(2) } };

    await assertTrades(prisma as any, [3, 7]);

    expect(prisma.categories.count).toHaveBeenCalledWith({
      where: { category_id: { in: [3, 7] }, parent_category_id: { not: null }, is_active: true, categories: { is_active: true } },
    });
  });

  it('si falta alguno (por ejemplo, de una categoría desactivada), INVALID_CATEGORY', async () => {
    const prisma = { categories: { count: jest.fn().mockResolvedValue(1) } };

    await expect(assertTrades(prisma as any, [3, 7])).rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
  });
});
