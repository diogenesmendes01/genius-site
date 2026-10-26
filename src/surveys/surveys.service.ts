import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { CreateSurveyResponseDto } from './dto/create-survey-response.dto';
import { SurveyAnswerEntity } from './survey-answer.entity';
import {
  CONTINUAR_POSITIVO,
  NIVEL_DESCONOCIDO,
  PROFESOR_SIN_IDENTIFICAR,
} from './survey-config';
import { SurveyResponseEntity } from './survey-response.entity';
import { SurveyDefinition, answerQuestions, validateAnswers } from './survey-types';

export interface SurveyFilters {
  nivel?: string;
  profesor?: string;
  canal?: string;
  modalidad?: string;
  from?: string;
  to?: string;
}

/** Segment columns a submission may carry (all optional in the DTO). */
const SEGMENT_COLUMNS = ['nivel', 'tiempo', 'modalidad', 'pais', 'rol'] as const;
type SegmentColumn = (typeof SEGMENT_COLUMNS)[number];

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    @InjectRepository(SurveyResponseEntity)
    private readonly responses: Repository<SurveyResponseEntity>,
    @InjectRepository(SurveyAnswerEntity)
    private readonly answers: Repository<SurveyAnswerEntity>,
  ) {}

  /**
   * Public: what the wizard needs to render itself. Enforces the link token
   * for surveys that require one, so a leaked /equipe URL without `?t=`
   * shows nothing.
   */
  config(def: SurveyDefinition, token?: string | null) {
    this.assertToken(def, token);
    return { key: def.key, name: def.name, ui: def.ui, steps: def.steps };
  }

  async create(
    def: SurveyDefinition,
    dto: CreateSurveyResponseDto,
    ip?: string | null,
  ): Promise<{ success: boolean }> {
    this.assertToken(def, dto.token);

    // Honeypot tripped → pretend success, store nothing. Real students never
    // see (or fill) the hidden field.
    if (dto.website && dto.website.trim() !== '') {
      this.logger.warn(`Honeypot triggered on POST /api/surveys (${def.key}) — dropping submission`);
      return { success: true };
    }

    const errors: string[] = [];
    const segments: Partial<Record<SegmentColumn, string | null>> = {};
    for (const col of SEGMENT_COLUMNS) {
      const raw = dto[col];
      if (raw === undefined || raw === null || raw === '') {
        segments[col] = null;
        continue;
      }
      const seg = def.segments[col];
      if (!seg) {
        errors.push(`${col}: no aplica a esta encuesta`);
      } else if (!seg.options.includes(raw)) {
        errors.push(`${col} inválido`);
      } else {
        segments[col] = raw;
      }
    }

    const validated = validateAnswers(def, dto.answers);
    errors.push(...validated.errors);
    if (errors.length) {
      throw new BadRequestException({ message: 'Respuestas inválidas', details: errors });
    }

    // "Tengo más de un profesor/a" / "Prefiero no decir" are not teachers:
    // they land as "sin identificar" instead of polluting the per-teacher table.
    const profesorRaw = def.allowProfesor ? dto.profesor?.trim() || null : null;
    const profesor =
      profesorRaw && !PROFESOR_SIN_IDENTIFICAR.includes(profesorRaw) ? profesorRaw : null;
    const contactoOk = def.allowContact && dto.contactoOk === true;

    const response = await this.responses.save(
      this.responses.create({
        survey: def.key,
        // No ?src= on the link → store the explicit 'directo' channel, so it
        // shows up in the filter options and `canal=directo` actually matches
        // (a NULL here would chart as "directo" but be unfilterable).
        canal: dto.canal?.trim() || 'directo',
        nps: dto.nps,
        csat: dto.csat,
        profesor,
        profesorNorm: profesor ? normalizeName(profesor) : null,
        nombre: contactoOk ? dto.nombre?.trim() || null : null,
        contacto: contactoOk ? dto.contacto?.trim() || null : null,
        contactoOk,
        testimonioOk: def.allowContact && dto.testimonioOk === true,
        nivel: segments.nivel ?? null,
        tiempo: segments.tiempo ?? null,
        modalidad: segments.modalidad ?? null,
        pais: segments.pais ?? null,
        rol: segments.rol ?? null,
        ipHash: ip ? hashIp(ip) : null,
      }),
    );

    const rows = Object.entries(validated.clean).map(([questionId, value]) =>
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
      `📊 Nueva respuesta de encuesta "${def.key}" (nps=${dto.nps}, csat=${dto.csat}, canal=${dto.canal ?? '—'})`,
    );
    return { success: true };
  }

  /**
   * Admin: all responses as a spreadsheet-friendly CSV. Separator is ';'
   * (LATAM/Spanish Excel default) with a UTF-8 BOM so acentos render;
   * Google Sheets auto-detects both. One column per config question, in
   * questionnaire order.
   */
  async exportCsv(def: SurveyDefinition, filters: SurveyFilters): Promise<string> {
    const rows = await this.responses.find({
      where: this.buildWhere(def, filters),
      order: { createdAt: 'DESC' },
    });
    const answerRows = rows.length
      ? await this.answers.find({ where: { responseId: In(rows.map((r) => r.id)) } })
      : [];
    const byResponse = groupBy(answerRows, (a) => a.responseId);
    const hashCounts = countByIpHash(rows);
    // Current questions first; removed columns only when the export actually
    // contains answers to them (no empty legacy columns on fresh data).
    const present = new Set(answerRows.map((a) => a.questionId));
    const questionIds = [
      ...answerQuestions(def).keys(),
      ...def.legacyAnswerIds.filter((id) => present.has(id)),
    ];
    const segmentCols = Object.keys(def.segments) as SegmentColumn[];

    const header = [
      'fecha',
      'canal',
      ...segmentCols,
      'nps',
      'csat',
      ...(def.allowProfesor ? ['profesor'] : []),
      ...(def.allowContact ? ['acepta_contacto', 'nombre', 'contacto', 'testimonio_ok'] : []),
      'posible_duplicado',
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
        ...segmentCols.map((c) => r[c] ?? ''),
        String(r.nps),
        String(r.csat),
        ...(def.allowProfesor ? [r.profesor ?? ''] : []),
        ...(def.allowContact
          ? [r.contactoOk ? 'sí' : 'no', r.nombre ?? '', r.contacto ?? '', r.testimonioOk ? 'sí' : 'no']
          : []),
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
    return '﻿' + lines.join('\r\n');
  }

  /** Admin: raw list of responses (with answers) for the dashboard drill-down. */
  async list(def: SurveyDefinition, filters: SurveyFilters) {
    const rows = await this.responses.find({
      where: this.buildWhere(def, filters),
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const answerRows = rows.length
      ? await this.answers.find({ where: { responseId: In(rows.map((r) => r.id)) } })
      : [];
    const byResponse = groupBy(answerRows, (a) => a.responseId);
    const hashCounts = countByIpHash(rows);

    return {
      survey: def.key,
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
   * Admin: everything the survey's dashboard tab renders, pre-aggregated.
   * `commentsLimit` caps the comments feed (30 in the dashboard tab); the
   * printable report passes Number.MAX_SAFE_INTEGER to include them all.
   */
  async stats(def: SurveyDefinition, filters: SurveyFilters, commentsLimit = 30) {
    const rows = await this.responses.find({
      where: this.buildWhere(def, filters),
      order: { createdAt: 'DESC' },
    });
    const answerRows = rows.length
      ? await this.answers.find({ where: { responseId: In(rows.map((r) => r.id)) } })
      : [];
    const byResponse = groupBy(answerRows, (a) => a.responseId);
    const responseById = new Map(rows.map((r) => [r.id, r]));
    const questions = answerQuestions(def);

    // ── NPS ──
    const total = rows.length;
    const nps = npsOf(rows);

    // ── scale5 averages ──
    const averages = Object.entries(def.averages).map(([qid, label]) => {
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
    for (const [qid, label] of Object.entries(def.distributions)) {
      const q = questions.get(qid);
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
    for (const [qid, label] of Object.entries(def.multi)) {
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

    // ── intención de continuar (alumnos v2; empty for surveys without it) ──
    const continuarRows = answerRows.filter((a) => a.questionId === 'continuar' && a.valueText);
    const continuarPositivos = continuarRows.filter((a) =>
      CONTINUAR_POSITIVO.includes(a.valueText as string),
    ).length;
    const continuar = {
      respondieron: continuarRows.length,
      positivos: continuarPositivos,
      enRiesgo: continuarRows.length - continuarPositivos,
      pctPositivo: continuarRows.length
        ? Math.round((continuarPositivos / continuarRows.length) * 100)
        : null,
    };

    // ── "No sé mi nivel" (alumnos v2) ──
    const nivelDesconocido = rows.filter((r) => r.nivel === NIVEL_DESCONOCIDO).length;

    // ── per-teacher table (grouped by normalised name) ──
    // Below minGroupN responses the averages/NPS are withheld: the number
    // would be noise and the answer trivially attributable to one student.
    // The row (name + count) still shows so the school sees who still needs
    // responses.
    const avgFor = (ids: Set<string>, qid: string) => {
      const vals = answerRows
        .filter((a) => ids.has(a.responseId) && a.questionId === qid && a.valueInt != null)
        .map((a) => a.valueInt as number);
      return vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    };
    const professors = def.allowProfesor
      ? [...groupBy(rows.filter((r) => r.profesorNorm), (r) => r.profesorNorm as string).entries()]
          .map(([norm, group]) => {
            const ids = new Set(group.map((g) => g.id));
            const insufficient = group.length < def.minGroupN;
            return {
              profesor: mostCommonSpelling(group),
              profesorNorm: norm,
              count: group.length,
              insufficient,
              minN: def.minGroupN,
              avgClaridad: insufficient ? null : avgFor(ids, 'prof_claridad'),
              avgFeedback: insufficient ? null : avgFor(ids, 'prof_feedback'),
              nps: insufficient ? null : npsOf(group).score,
            };
          })
          .sort((a, b) => b.count - a.count)
      : [];
    const unidentified = def.allowProfesor ? rows.filter((r) => !r.profesorNorm).length : 0;

    // ── breakdown by segment column (modalidad for alumnos; rol/tiempo for
    //    equipe), masked below minGroupN so a 2-person group never shows ──
    const breakdowns = def.breakdownBy
      .filter((col) => def.segments[col])
      .map((col) => {
        const column = col as SegmentColumn;
        const groups = def.segments[col].options
          .map((value) => {
            const group = rows.filter((r) => r[column] === value);
            const insufficient = group.length < def.minGroupN;
            return {
              value,
              count: group.length,
              insufficient,
              nps: insufficient ? null : npsOf(group).score,
              csatAvg: insufficient
                ? null
                : round1(group.reduce((s, r) => s + r.csat, 0) / group.length),
            };
          })
          .filter((g) => g.count > 0);
        const sinDato = rows.filter((r) => !r[column]).length;
        return { column: col, label: def.segments[col].label, minN: def.minGroupN, groups, sinDato };
      });

    // ── latest open comments ──
    const comments = answerRows
      .filter((a) => def.comments[a.questionId] && a.valueText)
      .map((a) => {
        const r = responseById.get(a.responseId);
        const meta = def.commentMeta
          ? {
              nivel: r?.nivel ?? null,
              modalidad: r?.modalidad ?? null,
              profesor: r?.profesor ?? null,
              canal: r?.canal ?? null,
              testimonioOk: r?.testimonioOk ?? false,
              nombre: r?.testimonioOk ? r?.nombre ?? null : null,
            }
          : { nivel: null, modalidad: null, profesor: null, canal: null, testimonioOk: false, nombre: null };
        return {
          text: a.valueText as string,
          question: def.comments[a.questionId],
          createdAt: r?.createdAt.toISOString() ?? null,
          ...meta,
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, commentsLimit);

    // ── filter option lists (whole survey, not just the filtered set) ──
    const allRows = await this.responses.find({ where: { survey: def.key } });
    const filterOptions = {
      niveles: uniqueSorted(allRows.map((r) => r.nivel)),
      profesores: def.allowProfesor
        ? [...groupBy(
            allRows.filter((r) => r.profesorNorm),
            (r) => r.profesorNorm as string,
          ).entries()].map(([norm, g]) => ({ norm, label: mostCommonSpelling(g) }))
        : [],
      canales: uniqueSorted(allRows.map((r) => r.canal)),
      modalidades: uniqueSorted(allRows.map((r) => r.modalidad)),
    };

    // ── possible duplicates: responses sharing a salted IP hash ──
    const hashCounts = countByIpHash(rows);
    const possibleDuplicates = rows.filter(
      (r) => r.ipHash && (hashCounts.get(r.ipHash) ?? 0) > 1,
    ).length;

    return {
      survey: {
        key: def.key,
        name: def.name,
        lang: def.ui.lang,
        allowProfesor: def.allowProfesor,
        allowContact: def.allowContact,
        minGroupN: def.minGroupN,
      },
      total,
      identified: rows.filter((r) => r.nombre || r.contacto).length,
      contactOk: rows.filter((r) => r.contactoOk).length,
      testimonioOk: rows.filter((r) => r.testimonioOk).length,
      possibleDuplicates,
      nps,
      csatAvg: total ? round1(rows.reduce((s, r) => s + r.csat, 0) / total) : null,
      continuar,
      nivelDesconocido,
      averages,
      distributions,
      multi,
      weekly,
      canales,
      professors,
      unidentified,
      breakdowns,
      comments,
      filterOptions,
    };
  }

  /** 403 when the survey requires a link token and it is missing/wrong. */
  private assertToken(def: SurveyDefinition, token?: string | null) {
    if (!def.accessTokenEnv) return;
    const expected = (process.env[def.accessTokenEnv] ?? '').trim();
    if (!expected) return; // not configured → open link
    if ((token ?? '').trim() !== expected) {
      throw new ForbiddenException('enlace de encuesta inválido');
    }
  }

  private buildWhere(
    def: SurveyDefinition,
    filters: SurveyFilters,
  ): FindOptionsWhere<SurveyResponseEntity> {
    const where: FindOptionsWhere<SurveyResponseEntity> = { survey: def.key };
    if (filters.nivel) where.nivel = filters.nivel;
    if (filters.profesor) where.profesorNorm = normalizeName(filters.profesor);
    if (filters.canal) where.canal = filters.canal;
    if (filters.modalidad) where.modalidad = filters.modalidad;
    if (filters.from || filters.to) {
      const from = filters.from ? new Date(`${filters.from}T00:00:00`) : new Date(0);
      const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : new Date();
      where.createdAt = Between(from, to);
    }
    return where;
  }
}

/** Promoters/passives/detractors + score (null when empty). */
function npsOf(rows: SurveyResponseEntity[]) {
  const promoters = rows.filter((r) => r.nps >= 9).length;
  const passives = rows.filter((r) => r.nps >= 7 && r.nps <= 8).length;
  const detractors = rows.filter((r) => r.nps <= 6).length;
  const total = rows.length;
  return {
    score: total ? Math.round(((promoters - detractors) / total) * 100) : null,
    promoters,
    passives,
    detractors,
  };
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
    .replace(/[̀-ͯ]/g, '')
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
