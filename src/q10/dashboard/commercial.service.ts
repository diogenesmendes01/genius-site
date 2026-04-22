import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import {
  cleanStr,
  groupCount,
  Item,
  monthKey,
  parseDate,
  safeArray,
} from './helpers';

@Injectable()
export class CommercialService {
  private readonly logger = new Logger(CommercialService.name);

  constructor(private readonly q10: Q10ClientService) {}

  private async tryFetch<T>(
    key: string,
    path: string,
    errors: Record<string, string>,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    try {
      return safeArray(await this.q10.getAll(path, params)) as T[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[commercial] ${path} failed: ${message}`);
      return [];
    }
  }

  /**
   * CRM deep-dive. All state is derived from /oportunidades thanks to
   * the nested `Negocio_favorito` object — we don't need to hit /negocios
   * per-opportunity (that endpoint only works with Consecutivo_oportunidad
   * and would be N+1).
   *
   * On a tenant that doesn't populate the CRM, every KPI here is `0` — the
   * service doesn't try to hide that. The UI marks the whole tab as
   * "CRM vacío" when `summary.totalOpportunities === 0`.
   */
  async commercial() {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};

    const ALL_TIME = { Fecha_inicio: '1900-01-01', Fecha_fin: '2099-12-31' };

    const [opps, contactos] = await Promise.all([
      this.tryFetch<Item>('opportunities', '/oportunidades', errors, ALL_TIME),
      this.tryFetch<Item>('contacts', '/contactos', errors),
    ]);

    // ─── Monthly leads trend (last 12 months) ───
    const now = new Date();
    const leadsByMonth: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      leadsByMonth[monthKey(d)] = 0;
    }
    for (const o of opps) {
      const d = parseDate(o.Fecha_registro);
      if (!d) continue;
      const k = monthKey(d);
      if (k in leadsByMonth) leadsByMonth[k] += 1;
    }
    const leadsSeries = Object.entries(leadsByMonth).map(([month, value]) => ({ month, value }));

    // ─── Funnel states from Negocio_favorito.Estado_negocio ───
    // Live dump: "Presentación" (in progress). Common Q10 values include
    // "Ganada", "Perdida", "Negociación", "Contacto inicial", etc. We
    // match case-insensitively by substring.
    const stateBucket = (o: Item) => {
      const raw = cleanStr(o.Negocio_favorito?.Estado_negocio).toLowerCase();
      if (!raw) return 'Sin estado';
      if (raw.includes('ganad')) return 'Ganada';
      if (raw.includes('perdid')) return 'Perdida';
      return 'En progreso';
    };
    const byState = groupCount(opps, stateBucket);
    const won = byState['Ganada'] ?? 0;
    const lost = byState['Perdida'] ?? 0;
    const inProgress = byState['En progreso'] ?? 0;
    const conversionRate = opps.length > 0
      ? Math.round((won / opps.length) * 100)
      : null;

    // ─── Origens & canais ───
    const byOrigin = groupCount(opps, (o) => o.Descripcion_como_se_entero);
    const byContactChannel = groupCount(opps, (o) => o.Descripcion_medio_contacto);

    const referralCount = opps.filter((o) => {
      const origen = cleanStr(o.Descripcion_como_se_entero).toLowerCase();
      return origen.includes('refer') || origen.includes('indic') || origen.includes('amig') || origen.includes('boca');
    }).length;
    const referralRate = opps.length > 0
      ? Math.round((referralCount / opps.length) * 100)
      : null;

    // ─── Advisor workload ───
    const advisorCount: Record<string, number> = {};
    for (const o of opps) {
      const advisor = cleanStr(o.Nombre_asesor) || 'Sin asignar';
      advisorCount[advisor] = (advisorCount[advisor] ?? 0) + 1;
    }
    const advisors = Object.entries(advisorCount)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);

    // ─── Geografia (top municípios) ───
    const byMunicipio = groupCount(opps, (o) => o.Nombre_municipio);
    const topMunicipios = Object.entries(byMunicipio)
      .map(([municipio, total]) => ({ municipio, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // ─── Recent opportunities ───
    const recentOpps = opps
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.Fecha_registro)?.getTime() ?? 0;
        const db = parseDate(b.Fecha_registro)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 15)
      .map((o) => ({
        consecutivo: cleanStr(o.Consecutivo_oportunidad),
        fecha: cleanStr(o.Fecha_registro).slice(0, 10),
        nombre: cleanStr(o.Nombre_oportunidad),
        correo: cleanStr(o.Correo_electronico),
        celular: cleanStr(o.Celular),
        origen: cleanStr(o.Descripcion_como_se_entero),
        canal: cleanStr(o.Descripcion_medio_contacto),
        estado: cleanStr(o.Negocio_favorito?.Estado_negocio) || 'Sin estado',
        asesor: cleanStr(o.Nombre_asesor) || 'Sin asignar',
        programa: cleanStr(o.Negocio_favorito?.Nombre_programa),
      }));

    return {
      generatedAt: new Date().toISOString(),
      partial: Object.keys(errors).length > 0,
      errors,
      degraded,
      summary: {
        totalOpportunities: opps.length,
        totalContacts: contactos.length,
        won,
        lost,
        inProgress,
        conversionRate,
        referralCount,
        referralRate,
        advisorCount: advisors.length,
      },
      charts: {
        leadsByMonth: leadsSeries,
        byState,
        byOrigin,
        byContactChannel,
      },
      tables: {
        advisors,
        topMunicipios,
        recentOpps,
      },
    };
  }
}
