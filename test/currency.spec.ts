import { CurrencyService } from '../src/q10/dashboard/currency.service';

describe('CurrencyService', () => {
  let svc: CurrencyService;

  beforeEach(() => {
    svc = new CurrencyService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns live rates from open.er-api.com on first call', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: 'success',
          base_code: 'USD',
          rates: { USD: 1, BRL: 5.4, CRC: 510 },
        }),
      } as Response);

    const result = await svc.getRates();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://open.er-api.com/v6/latest/USD',
      expect.any(Object),
    );
    expect(result.source).toBe('live');
    expect(result.base).toBe('USD');
    expect(result.rates.BRL).toBe(5.4);
    expect(result.rates.CRC).toBe(510);
  });

  it('serves from cache on the second call within TTL', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: 'success',
          rates: { USD: 1, BRL: 5.4 },
        }),
      } as Response);

    await svc.getRates();
    const second = await svc.getRates();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('cached');
    expect(second.rates.BRL).toBe(5.4);
  });

  it('falls back to a static table when the network fails on a fresh process', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await svc.getRates();

    expect(result.source).toBe('fallback');
    expect(result.rates.USD).toBe(1);
    expect(result.rates.CRC).toBeGreaterThan(0);
    expect(result.rates.BRL).toBeGreaterThan(0);
  });

  it('reuses stale cache instead of fallback when an existing cache exists', async () => {
    // First successful fetch populates cache
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'success', rates: { USD: 1, BRL: 5.0 } }),
    } as Response);
    await svc.getRates();

    // Force the next call past TTL — manipulate the cache timestamp
    (svc as any).cache.fetchedAt = 0;

    // Network fails on the refresh attempt
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('boom'));

    const result = await svc.getRates();
    // Should serve the previous (stale) cache rather than fallback table.
    expect(result.source).toBe('cached');
    expect(result.rates.BRL).toBe(5.0);
  });

  it('falls back when the API returns success=false', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'error', error_type: 'unsupported-code' }),
    } as Response);

    const result = await svc.getRates();
    expect(result.source).toBe('fallback');
  });
});
