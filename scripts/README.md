# Q10 probe scripts

Scripts **read-only** para explorar a API do Q10 Jack e expandir nosso
conhecimento empírico em `Q10-JACK-API.md`.

## `q10-probe.js`

Reconnaissance: bate nos endpoints do Q10 com `Limit=5&Offset=1`, infere
shape, extrai enum values de campos de baixa cardinalidade, redige PII
antes de escrever em disco, e produz um relatório markdown.

**Nunca emite POST/PUT/DELETE.** Rate-limited a 1 request a cada ~250ms.

### O que ele produz

```
probe-output/
├── SUMMARY.md              # relatório legível: tabela de status + campos + erros
└── schema/
    ├── administrativos.json
    ├── asignaturas.json
    └── ...                 # schema inferido + sample redigido (2 records, sem PII)
```

### Executar

#### Opção 1 — direto no host (se tiver Node 20+)

```bash
Q10_API_KEY="<sua chave>" node scripts/q10-probe.js
```

#### Opção 2 — Docker efêmero (não precisa rebuildar imagem nenhuma)

```bash
docker run --rm \
  -e Q10_API_KEY="<sua chave>" \
  -v "$PWD/scripts:/scripts:ro" \
  -v "$PWD/probe-output:/probe-output" \
  -w /probe-output \
  node:20-slim node /scripts/q10-probe.js
```

O flag `-w /probe-output` faz o script escrever lá dentro; o volume
monta de volta no host em `$PWD/probe-output`.

#### Opção 3 — dentro do compose do projeto

Se o `docker-compose.yml` tem um serviço `app` rodando:

```bash
# 1. Copia os scripts pra dentro do container (runtime image não tem scripts/)
docker compose cp scripts <nome-do-serviço>:/app/

# 2. Roda com as envs já presentes no container
docker compose exec <nome-do-serviço> node /app/scripts/q10-probe.js
```

### Flags e variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `Q10_API_KEY` | — (obrigatório) | Chave Jack (subscription key) |
| `Q10_BASE_URL` | `https://api.q10.com/v1` | URL base do Q10 |
| `Q10_PROBE_OUTPUT_DIR` | `./probe-output` | Diretório de saída |
| `Q10_PROBE_DELAY_MS` | `250` | Delay entre requests |
| `Q10_PROBE_LIMIT` | `5` | Records por endpoint |
| `--dry-run` | — | Só lista endpoints, não faz HTTP |

### Dry-run primeiro

```bash
node scripts/q10-probe.js --dry-run
```

Mostra a lista completa de endpoints que seriam batidos, sem fazer
nenhuma chamada HTTP. Útil pra confirmar antes de queimar quota.

### O que é redigido

Campos PII trocados por `<redacted>` ou `0` antes de escrever em disco —
seguro para commitar ou compartilhar:

`Nombre`, `Nombres`, `Apellido`, `Apellidos`, `Email`, `Correo`,
`Celular`, `Telefono`, `Identificacion`, `Documento`, `Cedula`,
`Direccion`, `Barrio`, `Ciudad`, `Fecha_nacimiento`, `Contraseña`,
`Nombre_estudiante`, `Identificacion_estudiante`, `Nombre_docente`,
`Nombre_producto` e variações.

Mantidos (não são PII, são úteis pra análise):
`Estado`, `Tipo`, `Genero`, `Nombre_programa`, `Nombre_curso`,
`Nombre_sede`, `Nombre_nivel`, `Nombre_jornada`, `Nombre_asignatura`,
`Nombre_periodo`, `Codigo_*`, `Consecutivo_*`, `Valor_*`, `Cupo_*`,
`Cantidad_*`, `Fecha_*` (exceto `Fecha_nacimiento`).

### Endpoints alvo (49 no total)

- **11 knownOk** — confirma que endpoints que já usamos não mudaram
- **32 unknown** — `/administrativos`, `/asignaturas`, `/aulas`, `/grados`,
  `/horarios`, `/pensiones`, `/facturas`, `/renovacion`, `/niveles`,
  `/matriculas`, `/inscripciones` e outros que nunca tocamos
- **6 filterProbes** — combinações de filtro novas nos endpoints que já
  usamos (`Activo=true`, `Estado=Abierto`, `/pagos` sem date filter, etc.)

### Depois de rodar

1. Abre `probe-output/SUMMARY.md` — tabelão com status de cada endpoint
2. Os campos novos interessantes (shapes, enums, envelopes) viram
   bullets na seção `Implementation Notes` do `Q10-JACK-API.md`
3. Se quiser, commita os JSONs redigidos em `test/fixtures/q10/` para
   servirem de fixture em specs de regressão futura

## Segurança

- O script **não faz** POST/PUT/DELETE — grep no código para confirmar.
- PII é redigida **antes** de chegar ao disco (no método `redactObject`).
- `Q10_API_KEY` nunca é escrita no output.
- Rate-limited para não saturar a API do Q10.
