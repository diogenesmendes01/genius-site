import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { CreateSurveyResponseDto } from './dto/create-survey-response.dto';
import { SurveyAnswerEntity } from './survey-answer.entity';
import { SurveyResponseEntity } from './survey-response.entity';
import {
  ANSWER_QUESTIONS,
  AVERAGE_QUESTIONS,
  COMMENT_QUESTIONS,
  DISTRIBUTION_QUESTIONS,
  MULTI_QUESTIONS,
  validateAnswers,
} from './survey-config';

export interface SurveyFilters {
  nivel?: string;
  profesor?: string;
  canal?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    @InjectRepository(SurveyResponseEntity)
    private readonly responses: Repository<SurveyResponseEntity>,
    @InjectRepository(SurveyAnswerEntity)
    private readonly answers: Repository<SurveyAnswerEntity>,
  ) {}

  async create(dto: CreateSurveyResponseDto, ip?: string | null): Promise<{ success: boolean }> {
    // Honeypot tripped → pretend success, store nothing. Real students never
    // see (or fill) the hidden field.
    if (dto.website && dto.website.trim() !== '') {
      this.logger.warn('Honeypot triggered on POST /api/surveys — dropping submission');
      return { success: true };
    }

    const { errors, clean } = validateAnswers(dto.answers);
    if (errors.length) {
      throw new BadRequestException({
        message: 'Respuestas inválidas',
        details: errors,
      });
    }

    const profesor = dto.profesor?.trim() || null;
    const response = await this.responses.save(
      this.responses.create({
        // No ?src= on the link → store the explicit 'directo' channel, so it
        // shows up in the filter options and `canal=directo` actually matches
        // (a NULL here would chart as "directo" but be unfilterable).
        canal: dto.canal?.trim() || 'directo',
        nps: dto.nps,
        csat: dto.csat,
        profesor,
        profesorNorm: profesor ? normalizeName(profesor) : null,
        nombre: dto.contactoOk ? dto.nombre?.trim() || null : null,
        contacto: dto.contactoOk ? dto.contacto?.trim() || null : null,
        contactoOk: dto.contactoOk === true,
        testimonioOk: dto.testimonioOk === true,
        nivel: dto.nivel ?? null,
        tiempo: dto.tiempo ?? null,
        ipHash: ip ? hashIp(ip) : null,
      }),
    );

    const rows = Object.entries(clean).map(([questionId, value]) =>
      this.answers.create({
        responseId: response.id,
        questionId,
        valueInt: typeof value === 'number' ? value : null,
        valueText: typeof value === 'string' ? value : null,
        valueJson: Array.isArray(value) ? JSON.stringify(value) : null,
      }),
    );
    if (rows.length) await this.answers.save(rows);

    this.logger.log(
      `📊 Nueva respuesta de encuesta (nps=${dto.nps}, csat=${dto.csat}, canal=${dto.canal ?? '—'})`,
    );
    return { success: true };
  }

  /**
   * Admin: all responses as a spreadsheet-friendly CSV. Separator is ';'
   * (LATAM/Spanish Excel default) with a UTF-8 BOM so acentos render;
   * Google Sheets auto-detects both. One column per config question, in
   * questionnaire order.
   */
  async exportCsv(filters: SurveyFilters): Promise<string> {
    const rows = await this.responses.find({
      where: this.buildWhere(filters),
      order: { createdAt: 'DESC' },
    });
    const answerRows = rows.length
      ? await this.answers.find({ where: { responseId: In(rows.map((r) => r.id)) } })
      : [];
    const byResponse = groupBy(answerRows, (a) => a.responseId);
    const hashCounts = countByIpHash(rows);
    const questionIds = [...ANSWER_QUESTIONS.keys()];

    const header = [
      'fecha', 'canal', 'nivel', 'tiempo', 'nps', 'csat', 'profesor',
      'acepta_contacto', 'nombre', 'contacto', 'testimonio_ok', 'posible_duplicado',
      ...questionIds,
    ];
    const lines = [header.map(csvCell).join(';')];

    for (const r of rows) {
      const answers = new Map(
        (byResponse.get(r.id) ?? []).map((a) => [a.questionId, answerValue(a)]),
      );
      const base = [
        r.createdAt.toISOString(),
        r.canal ?? '',
        r.nivel ?? '',
        r.tiempo ?? '',
        String(r.nps),
        String(r.csat),
        r.profesor ?? '',
        r.contactoOk ? 'sí' : 'no',
        r.nombre ?? '',
        r.contacto ?? '',
        r.testimonioOk ? 'sí' : 'no',
        r.ipHash && (hashCounts.get(r.ipHash) ?? 0) > 1 ? 'sí' : 'no',
      ];
      const answerCells = questionIds.map((qid) => {
        const v = answers.get(qid);
        if (v == null) return '';
        return Array.isArray(v) ? v.join(' | ') : String(v);
      });
      lines.push([...base, ...answerCells].map(csvCell).join(';'));
    }

    // BOM so Excel opens the acentos correctly.
    return '\uFEFF' + lines.join('\r\n');
  }

  /** Admin: raw list of responses (with answers) for the dashboard drill-down. */
  async list(filters: SurveyFilters) {
    const rows = await this.responses.find({
      where: this.buildWhere(filters),
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const answerRows = rows.length
      ? await this.answers.find({ where: { responseId: In(rows.map((r) => r.id)) } })
      : [];
    const byResponse = groupBy(answerRows, (a) => a.responseId);
    const hashCounts = countByIpHash(rows);

    return {
      count: rows.length,
      entries: rows.map((r) => ({
        ...stripIpHash(r),
        // Same salted IP hash seen more than once in this set → flag it so
        // the operator can eyeball possible duplicates (never auto-blocked).
        possibleDuplicate: !!(r.ipHash && (hashCounts.get(r.ipHash) ?? 0) > 1),
        answers: Object.fromEntries(
          (byResponse.get(r.id) ?? []).map((a) => [a.questionId, answerValue(a)]),
        ),
      })),
    };
  }

  /**
   * Admin: everything the "Encuesta" dashboard tab renders, pre-aggregated.
   * `commentsLimit` caps the comments feed (30 in the dashboard tab); the
   * printable report passes Number.MAX_SAFE_INTEGER to include them all.
   */
  async stats(filters: SurveyFilters, commentsLimit = 30) {
    const rows = await this.responses.find({
      where: this.buildWhere(filters),
      order: { createdAt: 'DESC' },
    });
    const answerRows = rows.length
      ? await this.answers.find({ where: { responseId: In(rows.map((r) => r.id)) } })
      : [];
    const byResponse = groupBy(answerRows, (a) => a.responseId);
    const responseById = new Map(rows.map((r) => [r.id, r]));

    // ── NPS ──
    const promoters = rows.filter((r) => r.nps >= 9).length;
    const passives = rows.filter((r) => r.nps >= 7 && r.nps <= 8).length;
    const detractors = rows.filter((r) => r.nps <= 6).length;
    const total = rows.length;
    const npsScore = total
      ? Math.round(((promoters - detractors) / total) * 100)
      : null;

    // ── scale5 averages ──
    const averages = Object.entries(AVERAGE_QUESTIONS).map(([qid, label]) => {
      const values = answerRows
        .filter((a) => a.questionId === qid && a.valueInt != null)
        .map((a) => a.valueInt as number);
      return {
        questionId: qid,
        label,
        avg: values.length ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null,
        count: values.length,
      };
    });

    // ── single-choice distributions (option order from the config) ──
    const distributions: Record<string, { label: string; dist: Record<string, number> }> = {};
    for (const [qid, label] of Object.entries(DISTRIBUTION_QUESTIONS)) {
      const q = ANSWER_QUESTIONS.get(qid);
      const dist: Record<string, number> = {};
      for (const opt of q?.options ?? []) dist[opt] = 0;
      for (const a of answerRows) {
        if (a.questionId === qid && a.valueText) {
          dist[a.valueText] = (dist[a.valueText] ?? 0) + 1;
        }
      }
      distributions[qid] = { label, dist };
    }

    // ── multi-select tallies ──
    const multi: Record<string, { label: string; dist: Record<string, number> }> = {};
    for (const [qid, label] of Object.entries(MULTI_QUESTIONS)) {
      const dist: Record<string, number> = {};
      for (const a of answerRows) {
        if (a.questionId !== qid || !a.valueJson) continue;
        try {
          for (const opt of JSON.parse(a.valueJson) as string[]) {
            dist[opt] = (dist[opt] ?? 0) + 1;
          }
        } catch {
          /* skip malformed row */
        }
      }
      multi[qid] = { label, dist };
    }

    // ── responses per ISO week (last 8 weeks, zero-filled) ──
    const weekly = lastWeeks(8).map((weekStart) => {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 7);
      const count = rows.filter(
        (r) => r.createdAt >= weekStart && r.createdAt < end,
      ).length;
      return { week: isoDate(weekStart), count };
    });

    // ── canal distribution ──
    const canales: Record<string, number> = {};
    for (const r of rows) {
      const key = r.canal || 'directo';
      canales[key] = (canales[key] ?? 0) + 1;
    }

    // ── per-teacher table (grouped by normalised name) ──
    const teacherGroups = groupBy(
      rows.filter((r) => r.profesorNorm),
      (r) => r.profesorNorm as string,
    );
    const professors = [...teacherGroups.entries()]
      .map(([norm, group]) => {
        const ids = new Set(group.map((g) => g.id));
        const avgOf = (qid: string) => {
          const vals = answerRows
            .filter((a) => ids.has(a.responseId) && a.questionId === qid && a.valueInt != null)
            .map((a) => a.valueInt as number);
          return vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
        };
        const promo = group.filter((g) => g.nps >= 9).length;
        const detra = group.filter((g) => g.nps <= 6).length;
        return {
          profesor: mostCommonSpelling(group),
          profesorNorm: norm,
          count: group.length,
          avgClaridad: avgOf('prof_claridad'),
          avgPaciencia: avgOf('prof_paciencia'),
          nps: Math.round(((promo - detra) / group.length) * 100),
        };
      })
      .sort((a, b) => b.count - a.count);
    const unidentified = rows.filter((r) => !r.profesorNorm).length;

    // ── latest open comments ──
    const comments = answerRows
      .filter((a) => COMMENT_QUESTIONS[a.questionId] && a.valueText)
      .map((a) => {
        const r = responseById.get(a.responseId);
        return {
          text: a.valueText as string,
          question: COMMENT_QUESTIONS[a.questionId],
          createdAt: r?.createdAt.toISOString() ?? null,
          nivel: r?.nivel ?? null,
          profesor: r?.profesor ?? null,
          canal: r?.canal ?? null,
          testimonioOk: r?.testimonioOk ?? false,
          nombre: r?.testimonioOk ? r?.nombre ?? null : null,
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, commentsLimit);

    // ── filter option lists (unfiltered values would be nicer, but the
    //    filtered set keeps the implementation simple and self-consistent) ──
    const allRows = await this.responses.find();
    const filterOptions = {
      niveles: uniqueSorted(allRows.map((r) => r.nivel)),
      profesores: [...groupBy(
        allRows.filter((r) => r.profesorNorm),
        (r) => r.profesorNorm as string,
      ).entries()].map(([norm, g]) => ({ norm, label: mostCommonSpelling(g) })),
      canales: uniqueSorted(allRows.map((r) => r.canal)),
    };

    // ── possible duplicates: responses sharing a salted IP hash ──
    const hashCounts = countByIpHash(rows);
    const possibleDuplicates = rows.filter(
      (r) => r.ipHash && (hashCounts.get(r.ipHash) ?? 0) > 1,
    ).length;

    return {
      total,
      identified: rows.filter((r) => r.nombre || r.contacto).length,
      contactOk: rows.filter((r) => r.contactoOk).length,
      testimonioOk: rows.filter((r) => r.testimonioOk).length,
      possibleDuplicates,
      nps: { score: npsScore, promoters, passives, detractors },
      csatAvg: total ? round1(rows.reduce((s, r) => s + r.csat, 0) / total) : null,
      averages,
      distributions,
      multi,
      weekly,
      canales,
      professors,
      unidentified,
      comments,
      filterOptions,
    };
  }

  private buildWhere(filters: SurveyFilters): FindOptionsWhere<SurveyResponseEntity> {
    const where: FindOptionsWhere<SurveyResponseEntity> = {};
    if (filters.nivel) where.nivel = filters.nivel;
    if (filters.profesor) where.profesorNorm = normalizeName(filters.profesor);
    if (filters.canal) where.canal = filters.canal;
    if (filters.from || filters.to) {
      const from = filters.from ? new Date(`${filters.from}T00:00:00`) : new Date(0);
      const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : new Date();
      where.createdAt = Between(from, to);
    }
    return where;
  }
}

/**
 * Salted hash of the submitter IP. The salt rides on JWT_SECRET (already
 * mandatory in production) so the raw IP is never stored nor recoverable.
 */
function hashIp(ip: string): string {
  const salt = process.env.JWT_SECRET ?? 'genius-encuesta-salt';
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32);
}

function countByIpHash(rows: SurveyResponseEntity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.ipHash) continue;
    counts.set(r.ipHash, (counts.get(r.ipHash) ?? 0) + 1);
  }
  return counts;
}

/**
 * Escape one CSV cell for the ';'-separated export. Values that start with
 * a formula trigger (=, +, -, @, tab, CR) get an apostrophe prefix so
 * Excel/Sheets render them as text instead of executing them — these cells
 * carry free text submitted through a PUBLIC form (CSV/formula injection).
 */
function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[";\n\r,]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** The hash itself never leaves the API — only the derived duplicate flag. */
function stripIpHash(row: SurveyResponseEntity): Omit<SurveyResponseEntity, 'ipHash'> {
  const { ipHash: _ipHash, ...rest } = row;
  return rest;
}

/** lowercase, no accents, collapsed whitespace — groups "Ana", "ana martínez". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function answerValue(a: SurveyAnswerEntity): number | string | string[] | null {
  if (a.valueInt != null) return a.valueInt;
  if (a.valueJson != null) {
    try {
      return JSON.parse(a.valueJson) as string[];
    } catch {
      return null;
    }
  }
  return a.valueText;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Display the spelling students used most for a normalised teacher name. */
function mostCommonSpelling(group: SurveyResponseEntity[]): string {
  const counts = new Map<string, number>();
  for (const r of group) {
    if (!r.profesor) continue;
    counts.set(r.profesor, (counts.get(r.profesor) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mondays of the last `n` ISO weeks, oldest first (local time). */
function lastWeeks(n: number): Date[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (monday.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(monday.getDate() - day);
  const weeks: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d);
  }
  return weeks;
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}
