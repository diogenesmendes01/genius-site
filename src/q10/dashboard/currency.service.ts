import { Injectable, Logger } from '@nestjs/common';

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: 'live' | 'cached' | 'fallback';
}

/**
 * USD-base exchange rates fetched from open.er-api.com (free, no API key,
 * 24h refresh). Q10 stores all monetary values in USD for this tenant
 * (verified against /pagos and /pagosPendientes — products like "Matricula
 * $20" make the base currency obvious; there's no per-record currency
 * field), so the dashboard treats every Valor_pagado/Valor_saldo as USD
 * and only converts at display time.
 *
 * The cache survives the JS event loop but is process-scoped — first hit
 * after a deploy goes to the network. We fall back to a static rate table
 * if the API is unreachable so the dashboard never breaks because of a
 * third-party outage.
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private cache: { rates: Record<string, number>; fetchedAt: number } | null = null;
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24h

  // Last-resort fallback if the network fetch fails on a fresh process.
  // Updated occasionally; not meant to be precise. Better to show "stale"
  // numbers than to crash the dashboard when open.er-api.com is down.
  private readonly FALLBACK_RATES: Record<string, number> = {
    USD: 1,
    BRL: 5.4,
    CRC: 510,
    EUR: 0.92,
  };

  async getRates(): Promise<ExchangeRates> {
    const now = Date.now();

    if (this.cache && now - this.cache.fetchedAt < this.TTL_MS) {
      return {
        base: 'USD',
        rates: this.cache.rates,
        fetchedAt: new Date(this.cache.fetchedAt).toISOString(),
        source: 'cached',
      };
    }

    try {
      const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        if (data?.result === 'success' && data?.rates && typeof data.rates === 'object') {
          this.cache = { rates: data.rates, fetchedAt: now };
          return {
            base: 'USD',
            rates: data.rates,
            fetchedAt: new Date(now).toISOString(),
            source: 'live',
          };
        }
      }
      this.logger.warn(`[currency] open.er-api responded ${resp.status} — using fallback`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[currency] fetch failed: ${message} — using fallback`);
    }

    // Reuse stale cache if we have one — better than fallback table.
    if (this.cache) {
      return {
        base: 'USD',
        rates: this.cache.rates,
        fetchedAt: new Date(this.cache.fetchedAt).toISOString(),
        source: 'cached',
      };
    }
    return {
      base: 'USD',
      rates: this.FALLBACK_RATES,
      fetchedAt: 'fallback',
      source: 'fallback',
    };
  }
}
