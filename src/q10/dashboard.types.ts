/** Q10 /periodos record shape (Genius Idiomas tenant, verified 2026-04-21). */
export interface Q10Period {
  Codigo?: string;
  Id?: string;
  Consecutivo?: string | number;
  Consecutivo_periodo?: string | number;
  Nombre?: string;
  Descripcion?: string;
  Fecha_inicio?: string;
  Fecha_fin?: string;
  Estado?: string;
  [key: string]: unknown;
}

/** Q10 /estudiantes?Periodo=X record shape. */
export interface Q10Student {
  Codigo_estudiante?: string;
  Primer_nombre?: string;
  Segundo_nombre?: string;
  Primer_apellido?: string;
  Segundo_apellido?: string;
  Nombre_completo?: string;
  Nombre_programa?: string;
  Codigo_programa?: string;
  Nombre_sede?: string;
  Codigo_sede?: string;
  Condicion_matricula?: string;
  Fecha_matricula?: string;
  Fecha_creacion?: string;
  Estado?: string;
  [key: string]: unknown;
}

/** Q10 /pagos?Fecha_inicio&Fecha_fin record shape. */
export interface Q10Payment {
  Codigo?: string;
  Codigo_persona?: string;
  Valor_pagado?: number | string;
  Fecha_pago?: string;
  Nombre_estudiante?: string;
  [key: string]: unknown;
}

/** Q10 /pagosPendientes?Consecutivo_periodo record shape. */
export interface Q10PendingPayment {
  Valor_saldo?: number | string;
  Nombre_producto?: string;
  Nombre_periodo?: string;
  Fecha_vencimiento?: string;
  Estudiante?: {
    Codigo_persona?: string;
    Nombre_completo?: string;
    Primer_nombre?: string;
    Segundo_nombre?: string;
    Primer_apellido?: string;
    Segundo_apellido?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Q10 /oportunidades record shape. */
export interface Q10Opportunity {
  Codigo?: string;
  Consecutivo_oportunidad?: string;
  Nombre_oportunidad?: string;
  Correo_electronico?: string;
  Celular?: string;
  Telefono?: string;
  Descripcion_como_se_entero?: string;
  Descripcion_medio_contacto?: string;
  Nombre_asesor?: string;
  Estado?: string;
  [key: string]: unknown;
}

/** Q10 /contactos record shape. */
export interface Q10Contact {
  Codigo_contacto?: string;
  Codigo?: string;
  Id?: string;
  Nombres?: string;
  Apellidos?: string;
  Correo_electronico?: string;
  Telefono?: string;
  [key: string]: unknown;
}
