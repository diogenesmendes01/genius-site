import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Q10MockService } from './q10-mock.service';

type CacheEntry = { value: unknown; expiresAt: number };

@Injectable()
export class Q10ClientService {
  private readonly logger = new Logger(Q10ClientService.name);
  private readonly http: AxiosInstance;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly mock: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly mockSvc: Q10MockService,
  ) {
    const baseURL =
      this.config.get<string>('Q10_BASE_URL') ?? 'https://api.q10.com/v1';
    const apiKey = this.config.get<string>('Q10_API_KEY') ?? '';
    this.mock = this.config.get<string>('Q10_MOCK') === 'true';
    this.cacheTtlMs =
      Number(this.config.get<string>('Q10_CACHE_TTL') ?? 300) * 1000;

    this.http = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (this.mock) {
      this.logger.warn('Q10 MOCK MODE active — using in-memory data');
    } else if (!apiKey) {
      this.logger.warn('Q10_API_KEY not set — live calls will fail');
    }
  }

  /**
   * GET a Q10 endpoint with in-memory TTL cache. Mock mode short-circuits to
   * the mock service when Q10_MOCK=true.
   */
  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    if (this.mock) return this.mockSvc.get<T>(path, params);

    const key = this.cacheKey('GET', path, params);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;

    const data = await this.request<T>({ method: 'GET', url: path, params });
    this.cache.set(key, { value: data, expiresAt: Date.now() + this.cacheTtlMs });
    return data;
  }

  /**
   * Page through a Q10 list endpoint until exhausted. Q10's list endpoints
   * accept `Limit` and `Offset` query params; the sibling Q10 WhatsApp Chrome
   * extension forces `Limit=1000&Offset=1` on every call as its workaround,
   * which taught us two things: (1) the server enforces a small cap
   * (~50 records per page) if Limit is omitted, and (2) Offset is 1-based,
   * not 0-based. We page at 500 per request by default — 1000 works but
   * burns more memory on large schools, and 500 keeps each response under a
   * safe payload size.
   *
   * A `maxRecords` safety cap (default 50k) prevents a pathological endpoint
   * from looping forever; when hit we log a warn and return what we have so
   * the dashboard still renders. Mock mode returns the full dataset in one
   * shot (there's no real pagination to exercise), so we delegate to the
   * underlying mock `.get` once. The per-page cache is driven by the
   * existing `.get` cacheKey, which includes the full params object — each
   * (Limit, Offset) pair is cached independently, so subsequent `getAll`
   * calls are served from memory.
   */
  async getAll<T = unknown>(
    path: string,
    params?: Record<string, unknown>,
    opts?: { pageSize?: number; maxRecords?: number },
  ): Promise<T[]> {
    if (this.mock) {
      const raw = await this.mockSvc.get<unknown>(path, params);
      return Array.isArray(raw) ? (raw as T[]) : [];
    }

    const pageSize = opts?.pageSize ?? 500;
    const maxRecords = opts?.maxRecords ?? 50_000;
    const out: T[] = [];
    // Q10 uses 1-based offsets — verified in the sibling WhatsApp plugin's
    // background/service-worker.js (it forces `Offset=1` on every call).
    let offset = 1;

    while (out.length < maxRecords) {
      const page = await this.get<unknown>(path, {
        ...(params ?? {}),
        Limit: pageSize,
        Offset: offset,
      });

      // Defensive: if the endpoint ever returns a non-array payload (wrapped
      // object, error shape, etc.) treat it as end-of-pages instead of
      // throwing. `getAll` is only meaningful for list endpoints.
      if (!Array.isArray(page)) break;

      out.push(...(page as T[]));

      // Partial page ⇒ we've reached the end. Full page ⇒ there may be more.
      if (page.length < pageSize) break;

      offset += pageSize;
    }

    if (out.length >= maxRecords) {
      this.logger.warn(
        `[Q10] getAll(${path}) hit maxRecords cap (${maxRecords}) — results truncated`,
      );
      return out.slice(0, maxRecords);
    }

    return out;
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    if (this.mock) return this.mockSvc.post<T>(path, body);
    const data = await this.request<T>({ method: 'POST', url: path, data: body });
    this.invalidatePath(path);
    return data;
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    if (this.mock) return this.mockSvc.put<T>(path, body);
    const data = await this.request<T>({ method: 'PUT', url: path, data: body });
    this.invalidatePath(path);
    return data;
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    if (this.mock) return this.mockSvc.patch<T>(path, body);
    const data = await this.request<T>({ method: 'PATCH', url: path, data: body });
    this.invalidatePath(path);
    return data;
  }

  async delete<T = unknown>(path: string): Promise<T> {
    if (this.mock) return this.mockSvc.delete<T>(path);
    const data = await this.request<T>({ method: 'DELETE', url: path });
    this.invalidatePath(path);
    return data;
  }

  /** Proxy raw request — used by the generic /api/q10/* catch-all. */
  async raw(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<{ status: number; data: unknown }> {
    if (this.mock) {
      const data = await this.mockSvc.raw(method, path, params, body);
      return { status: 200, data };
    }
    try {
      const resp = await this.http.request({
        method,
        url: path,
        params,
        data: body,
      });
      return { status: resp.status, data: resp.data };
    } catch (err) {
      return this.handleAxiosError(err, path);
    }
  }

  private async request<T>(opts: AxiosRequestConfig): Promise<T> {
    try {
      const resp = await this.http.request<T>(opts);
      return resp.data;
    } catch (err) {
      const { status, data } = this.handleAxiosError(err, String(opts.url));
      throw new HttpException(data as object, status);
    }
  }

  private handleAxiosError(err: unknown, path: string) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 502;
      const data = err.response?.data ?? {
        error: 'Q10 upstream error',
        detail: err.message,
      };
      this.logger.error(`[Q10] ${err.config?.method?.toUpperCase()} ${path} → ${status}`);
      return { status, data };
    }
    this.logger.error(`[Q10] ${path} → unknown error`, err as Error);
    return { status: 500, data: { error: 'Unexpected error' } };
  }

  private cacheKey(method: string, path: string, params?: Record<string, unknown>) {
    return `${method} ${path} ${JSON.stringify(params ?? {})}`;
  }

  private invalidatePath(path: string) {
    const prefix = path.split('?')[0].split('/')[1] ?? '';
    for (const key of this.cache.keys()) {
      if (key.includes(`/${prefix}`)) this.cache.delete(key);
    }
  }

  /** Admin: clear the whole cache (used by /api/dashboard/refresh). */
  clearCache() {
    this.cache.clear();
  }
}
