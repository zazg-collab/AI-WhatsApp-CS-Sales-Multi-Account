import { ProductsService } from './products.service';

describe('ProductsService.relevantForQuery', () => {
  const products = [
    { id: '1', sku: 'PRL-A', name: 'Kavling Pringland A', category: 'Yogyakarta', stock: 3, price: 100, unit: null },
    { id: '2', sku: 'SOFA-1', name: 'Sofa Minimalis', category: 'Furnitur', stock: 0, price: 200, unit: null },
    { id: '3', sku: 'PRL-B', name: 'Kavling Pringland B', category: 'Borneo', stock: 5, price: 150, unit: null },
  ];
  let service: ProductsService;

  beforeEach(() => {
    const prisma: any = { product: { findMany: jest.fn().mockResolvedValue(products) } };
    service = new ProductsService(prisma);
  });

  it('returns only products matching the query terms', async () => {
    const res = await service.relevantForQuery('stok kavling pringland A');
    expect(res.map((p) => p.sku)).toEqual(expect.arrayContaining(['PRL-A', 'PRL-B']));
    expect(res.map((p) => p.sku)).not.toContain('SOFA-1');
  });

  it('ranks the more specific match first', async () => {
    const res = await service.relevantForQuery('sofa');
    expect(res[0].sku).toBe('SOFA-1');
  });

  it('returns [] when nothing matches or the query is empty', async () => {
    expect(await service.relevantForQuery('xyz tidakada')).toEqual([]);
    expect(await service.relevantForQuery('')).toEqual([]);
  });
});
