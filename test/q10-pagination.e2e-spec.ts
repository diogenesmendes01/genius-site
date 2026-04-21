import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Q10ClientService } from '../src/q10/q10-client.service';
import { Q10MockService } from '../src/q10/q10-mock.service';

/**
 * Build a fresh Q10ClientService wired up with a stub config. When
 * `mock=false`, .get()/.getAll() talk to the real axios instance — we stub
 * the internal `get` method via jest.spyOn so we can script per-call
 * responses without needing a network.
 */
function makeClient(mock: boolean) {
  const cfg = {
    get: (key: string) => {
      if (key === 'Q10_BASE_URL') return 'https://example.test/v1';
      if (key === 'Q10_API_KEY') return 'k';
      if (key === 'Q10_MOCK') return mock ? 'true' : 'false';
      if (key === 'Q10_CACHE_TTL') return '0';
      return undefined;
    },
  } as unknown as ConfigService;

  const mockSvc = new Q10MockService();
  return new Q10ClientService(cfg, mockSvc);
}

describe('Q10ClientService.getAll — pagination', () => {
  beforeAll(() => {
    // Silence the "Q10 MOCK MODE active" and cap warnings so the test log
    // stays readable. Individual assertions still use jest.spyOn where needed.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  it('concatenates three pages of 500/500/200 into a single 1200-item list', async () => {
    const client = makeClient(false);
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: i }));

    const getSpy = jest
      .spyOn(client, 'get')
      .mockResolvedValueOnce(page(500))
      .mockResolvedValueOnce(page(500))
      .mockResolvedValueOnce(page(200));

    const out = await client.getAll<{ id: number }>('/estudiantes');

    expect(out).toHaveLength(1200);
    expect(getSpy).toHaveBeenCalledTimes(3);
    // Verify Limit/Offset convention: 1-based offset, stepping by pageSize.
    expect(getSpy.mock.calls[0][1]).toMatchObject({ Limit: 500, Offset: 1 });
    expect(getSpy.mock.calls[1][1]).toMatchObject({ Limit: 500, Offset: 501 });
    expect(getSpy.mock.calls[2][1]).toMatchObject({ Limit: 500, Offset: 1001 });
  });

  it('stops when a subsequent page returns an empty array', async () => {
    const client = makeClient(false);
    const full = Array.from({ length: 500 }, (_, i) => ({ id: i }));

    const getSpy = jest
      .spyOn(client, 'get')
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([]);

    const out = await client.getAll('/pagos');

    // Empty page has length < pageSize, so we break after it — 2 calls total.
    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(500);
  });

  it('caps at maxRecords and logs a warning when upstream never shrinks', async () => {
    const client = makeClient(false);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const full = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const getSpy = jest.spyOn(client, 'get').mockResolvedValue(full);

    const out = await client.getAll('/estudiantes');

    // 50 000 / 500 = 100 iterations before the cap trips.
    expect(getSpy).toHaveBeenCalledTimes(100);
    expect(out).toHaveLength(50_000);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/maxRecords cap \(50000\)/),
    );
  });

  it('short-circuits pagination in mock mode — exactly one underlying request', async () => {
    const client = makeClient(true);
    const mockSvc: Q10MockService = (client as unknown as { mockSvc: Q10MockService })
      .mockSvc;
    const mockGetSpy = jest
      .spyOn(mockSvc, 'get')
      .mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }] as unknown as never);
    // We must also ensure the live `.get` is never called.
    const liveGetSpy = jest.spyOn(client, 'get');

    const out = await client.getAll('/estudiantes');

    expect(out).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(mockGetSpy).toHaveBeenCalledTimes(1);
    // No Limit/Offset was appended — mock mode skips pagination entirely.
    expect(mockGetSpy).toHaveBeenCalledWith('/estudiantes', undefined);
    expect(liveGetSpy).not.toHaveBeenCalled();
  });

  it('treats a non-array payload as end-of-pages', async () => {
    const client = makeClient(false);
    const getSpy = jest
      .spyOn(client, 'get')
      .mockResolvedValueOnce({ error: 'wrapped response' } as unknown as never);

    const out = await client.getAll('/estudiantes');

    expect(out).toEqual([]);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});
