import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as mock from './mock/mock-data';

/**
 * Resolves a Q10 path prefix to the mock dataset that represents it.
 * Keys must be lowercase (we lowercase the path before looking up).
 */
const DATASETS: Record<string, unknown[]> = {
  programas: mock.programas,
  periodos: mock.periodos,
  sedes: mock.sedes,
  sedesjornadas: mock.sedes,
  contactos: mock.contactos,
  estudiantes: mock.estudiantes,
  usuarios: mock.estudiantes,
  oportunidades: mock.oportunidades,
  ordenesdepago: mock.ordenesDePago,
  ordenespago: mock.ordenesDePago,
  conceptosdepago: mock.conceptosDePago,
  inscripciones: mock.inscripciones,
  preinscripciones: mock.inscripciones,
  matriculas: mock.matriculas,
  matriculasprogramas: mock.matriculas,
  'matriculas-colegios': mock.matriculas,
  estadocuentaestudiantes: mock.estadocuentaestudiantes,
  pagospendientes: mock.pagosPendientes,
  pagos: mock.pagos,
  negocios: mock.negocios,
  actividades: mock.actividades,
};

function findById(list: unknown[], id: string) {
  return list.find((item: any) => {
    if (!item || typeof item !== 'object') return false;
    return (
      item.Codigo === id ||
      item.Id === id ||
      item.id === id ||
      item.Codigo_contacto === id ||
      item.Codigo_estudiante === id ||
      item.Codigo_matricula === id ||
      item.Codigo_inscripcion === id ||
      item.Codigo_orden === id
    );
  });
}

function normalizePath(path: string): string[] {
  return path.replace(/^\//, '').split('?')[0].split('/').filter(Boolean);
}

@Injectable()
export class Q10MockService {
  private readonly logger = new Logger(Q10MockService.name);

  private log(method: string, path: string, detail = '') {
    this.logger.debug(`[MOCK] ${method} ${path}${detail ? ' — ' + detail : ''}`);
  }

  private async delay() {
    // Simulate realistic API latency
    const ms = 100 + Math.random() * 300;
    await new Promise((r) => setTimeout(r, ms));
  }

  async get<T = unknown>(path: string, _params?: Record<string, unknown>): Promise<T> {
    await this.delay();
    const segs = normalizePath(path);
    const [base, id] = segs.map((s) => s.toLowerCase());
    const dataset = DATASETS[base];
    this.log('GET', path, dataset ? `${dataset.length} items` : 'unknown endpoint');

    if (!dataset) return [] as unknown as T;

    if (id) {
      const item = findById(dataset, id);
      if (!item) throw new NotFoundException(`Recurso ${id} no encontrado`);
      return item as T;
    }
    return dataset as unknown as T;
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    await this.delay();
    const [base] = normalizePath(path).map((s) => s.toLowerCase());
    const dataset = DATASETS[base];
    const prefix = (base ?? 'REC').slice(0, 3).toUpperCase();
    const id = `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const record = {
      Codigo: id,
      Id: id,
      ...(body as object),
      Fecha_creacion: new Date().toISOString().slice(0, 10),
    };
    if (Array.isArray(dataset)) dataset.push(record);
    this.log('POST', path, `created ${id}`);
    return record as unknown as T;
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    await this.delay();
    const segs = normalizePath(path);
    const [base, id] = segs.map((s) => s.toLowerCase());
    const dataset = DATASETS[base];
    if (!dataset || !id) throw new NotFoundException(`Recurso no encontrado`);

    const idx = dataset.findIndex(
      (x: any) => x.Codigo === id || x.Id === id || x.id === id,
    );
    if (idx === -1) throw new NotFoundException(`Recurso ${id} no encontrado`);
    dataset[idx] = { ...(dataset[idx] as object), ...(body as object) };
    this.log('PUT', path, `updated ${id}`);
    return dataset[idx] as T;
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.put<T>(path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    await this.delay();
    this.log('DELETE', path);
    return { success: true } as unknown as T;
  }

  async raw(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<unknown> {
    const m = method.toUpperCase();
    if (m === 'GET') return this.get(path, params);
    if (m === 'POST') return this.post(path, body);
    if (m === 'PUT') return this.put(path, body);
    if (m === 'PATCH') return this.patch(path, body);
    if (m === 'DELETE') return this.delete(path);
    return { success: true };
  }
}
