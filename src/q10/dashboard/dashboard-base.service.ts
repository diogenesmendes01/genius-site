import { Logger } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import { safeArray } from './helpers';

export abstract class DashboardBaseService {
  protected abstract readonly logPrefix: string;
  protected readonly logger: Logger;

  constructor(protected readonly q10: Q10ClientService) {
    this.logger = new Logger(this.constructor.name);
  }

  protected async tryFetch<T>(
    key: string,
    path: string,
    errors: Record<string, string>,
    params?: Record<string, unknown>,
    opts?: { pageSize?: number; maxRecords?: number; degraded?: Record<string, string> },
  ): Promise<T[]> {
    try {
      const out = safeArray(
        await this.q10.getAll(path, params, {
          pageSize: opts?.pageSize,
          maxRecords: opts?.maxRecords,
        }),
      ) as T[];
      const cap = opts?.maxRecords ?? 50_000;
      if (out.length === cap && opts?.degraded) {
        opts.degraded[key] = `Posible truncamiento — límite de ${cap} registros alcanzado`;
      }
      return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[${this.logPrefix}] ${path} failed: ${message}`);
      return [];
    }
  }
}
