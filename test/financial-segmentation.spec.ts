import { FinancialService } from '../src/q10/dashboard/financial.service';

const makeQ10 = (responses: Record<string, any[] | (() => any[])>) =>
  ({
    getAll: jest.fn(async (path: string) => {
      const v = responses[path];
      if (typeof v === 'function') return v();
      return v ?? [];
    }),
  } as any);

describe('FinancialService — modality-segmented revenue', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pagos = [
    // Regular payments
    {
      Codigo_persona: 'P1',
      Nombre_producto: 'Mensualidad 14 R - Recife',
      Valor_pagado: 100,
      Fecha_pago: '2026-03-01',
    },
    {
      Codigo_persona: 'P2',
      Nombre_producto: 'Mensualidad 12 Regular - Panamá',
      Valor_pagado: 150,
      Fecha_pago: '2026-03-02',
    },
    // Semi Intensivo payments
    {
      Codigo_persona: 'P3',
      Nombre_producto: 'Mensualidad 08 S - San José',
      Valor_pagado: 200,
      Fecha_pago: '2026-03-03',
    },
    {
      Codigo_persona: 'P4',
      Nombre_producto: 'Mensualidad 05 Semi Intensivo - Panamá',
      Valor_pagado: 75,
      Fecha_pago: '2026-03-04',
    },
    // Unclassified (Matrícula)
    {
      Codigo_persona: 'P5',
      Nombre_producto: 'Matrícula',
      Valor_pagado: 40,
      Fecha_pago: '2026-03-05',
    },
  ];

  it('sums revenue per modality and exposes all three keys in charts', async () => {
    const q10 = makeQ10({
      '/periodos': [],
      '/pagos': pagos,
    });
    const svc = new FinancialService(q10);

    const result = await svc.financial(12);

    expect(result.summary.revenueRegular).toBe(250); // 100 + 150
    expect(result.summary.revenueIntensivo).toBe(275); // 200 + 75
    expect(result.summary.revenueUnclassified).toBe(40);

    expect(result.charts.revenueByModality).toBeDefined();
    expect(Object.keys(result.charts.revenueByModality).sort()).toEqual(
      ['Desconocida', 'Regular', 'Semi Intensivo'].sort(),
    );
    expect(result.charts.revenueByModality.Regular).toBe(250);
    expect(result.charts.revenueByModality['Semi Intensivo']).toBe(275);
    expect(result.charts.revenueByModality.Desconocida).toBe(40);
  });

  it('honours explicit from/to ISO dates', async () => {
    const q10 = makeQ10({
      '/periodos': [],
      '/pagos': pagos,
    });
    const svc = new FinancialService(q10);

    const result = await svc.financial(12, '2026-01-01', '2026-04-01');
    expect(result.summary.from).toBe('2026-01-01');
    expect(result.summary.to).toBe('2026-04-01');
  });

  it('falls back to monthsBack when from is invalid or missing', async () => {
    const q10 = makeQ10({
      '/periodos': [],
      '/pagos': pagos,
    });
    const svc = new FinancialService(q10);

    // Invalid "from" — falls back to monthsBack window.
    const result = await svc.financial(6, 'not-a-date');
    expect(result.summary.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.summary.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The rangeStart is ~6 months before `to`; ensure from < to.
    expect(result.summary.from < result.summary.to).toBe(true);

    // Missing "from" entirely — same fallback path.
    const result2 = await svc.financial(3);
    expect(result2.summary.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result2.summary.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result2.summary.from < result2.summary.to).toBe(true);
  });
});
