# Encuesta de Satisfação dos Alunos

Pesquisa anônima em espanhol, em formato wizard de 6 etapas, com resultados
numa aba dedicada do dashboard admin. Nenhum dado vem do Q10 — tudo é
auto-declarado pelo aluno e fica no SQLite local.

## O que mudou na v2 (outubro/2026)

Revisão feita a partir do informe de julho/2026 (10 respostas, médias de
professor todas no teto, e comentários pedindo clareza sobre o nível,
acesso ao material e resposta mais rápida do suporte).

- **Mais curta**: 15 perguntas obrigatórias (eram 22). Saíram as que mediam a
  mesma coisa (3 de aulas online, 4 de professor, `comunicacion`,
  `lo_mejor`/`a_mejorar`).
- **Professor em lista fechada** (`PROFESOR_OPTIONS` em `survey-config.ts`)
  com "Tengo más de un profesor/a" e "Prefiero no decir". Acaba com
  "Celia" / "Celia Avila" / "Celia Falcao" virando três linhas. **Mantenha a
  lista em dia** quando um professor entra ou sai.
- **Segmentação nova**: `modalidad` (obrigatória: grupo regular /
  semi-intensivo / intensivo / particulares) e `pais` (opcional). Ambas viram
  coluna, filtro no dashboard e coluna no CSV. O nível ganhou a opção
  **"No sé mi nivel"**, que aparece como KPI.
- **Perguntas novas, ligadas aos comentários de julho**: razão da nota do NPS
  (`nps_motivo`), intenção de continuar nos próximos 6 meses (`continuar`,
  com "¿qué te haría quedarte?" para quem está em dúvida), clareza sobre o
  próprio nível (`progreso_claridad`), acesso ao material fora da aula
  (`materiales_acceso`) e tempo de resposta do suporte (`soporte_tiempo`).
  `soporte` ganhou a saída "No he necesitado ayuda", que não entra na média.
- **Anonimato por professor**: com menos de 3 respostas
  (`MIN_PROFESSOR_N`) a linha mostra só a contagem, sem médias nem NPS.
- **Histórico preservado**: os ids mantidos (`csat`, `nps`, `progreso`,
  `prof_claridad`, …) significam o mesmo; os ids removidos estão em
  `LEGACY_ANSWER_IDS` e continuam saindo no CSV quando há respostas antigas.
  Novos envios com esses ids são rejeitados.
- O rascunho salvo no navegador mudou de chave (`genius:encuesta:v2`), então
  um aluno que tinha a v1 pela metade começa do zero.

### Como aplicar (plano de coleta)

A taxa de resposta de julho (10 respostas, todas de um único disparo no
WhatsApp) é o maior problema a resolver. Sugestão:

| Quando | Como | Meta |
|---|---|---|
| Pesquisa principal, 2× ao ano (antes das renovações) | Semana 1: professor abre `?src=en-clase` nos últimos 5 min da aula. Semana 2: lembrete no grupo (`?src=whatsapp`). | ≥ 50% dos alunos ativos |
| Pulso de boas-vindas na 4ª semana | 5 perguntas (`?src=onboarding`) | Pegar problema antes do 1º cancelamento |
| Pesquisa de saída ao cancelar | 3 perguntas enviadas pela secretaria | 100% dos cancelamentos |

Os dois últimos ainda usam o mesmo questionário; separar em pesquisas
distintas exige generalizar `survey-config.ts` para múltiplas pesquisas
(o mesmo passo que permitiria a pesquisa de clima da equipe no site).

## Como funciona

| Peça | Onde |
|---|---|
| Página do aluno | `public/encuesta/` → **`https://geniusidiomas.com/encuesta`** |
| Perguntas (config única) | `src/surveys/survey-config.ts` |
| API | `POST /api/surveys` (público, throttle 5/min + honeypot) · `GET /api/surveys/config` (público) · `GET /api/surveys/stats` e `GET /api/surveys` (admin, JWT) |
| Banco | tabelas `survey_responses` (colunas fixas: nps, csat, professor, contato, nível…) e `survey_answers` (1 linha por resposta configurável) |
| Resultados | Dashboard admin → aba **"Encuesta"** (`/dashboard`) |
| QR codes | `public/assets/qr/` → servidos em `/assets/qr/…` |

O wizard salva as respostas em `localStorage` a cada clique — o aluno pode
voltar etapas ou dar refresh sem perder nada. Ao enviar, o estado é limpo.

## Gerar e divulgar os links (produção)

O link base é `https://geniusidiomas.com/encuesta`. O parâmetro **`?src=`**
identifica o canal e aparece no dashboard como "Canal de origen" — use um
link por canal para saber de onde veio cada resposta:

| Canal | Link |
|---|---|
| Grupo de WhatsApp da turma | `https://geniusidiomas.com/encuesta?src=whatsapp` |
| Slide/chat no fim da aula online | `https://geniusidiomas.com/encuesta?src=en-clase` |
| Instagram (bio ou stories) | `https://geniusidiomas.com/encuesta?src=instagram` |

Qualquer outro valor de `src` (só letras/números/hífen, até 40 caracteres)
também funciona e cria um canal novo automaticamente — ex.:
`?src=email-marzo`. Sem `src`, a resposta entra como canal `directo`.

### QR codes

Os QRs dos três canais já estão gerados em `public/assets/qr/`
(PNG 1024px para imprimir/projetar e SVG escalável):

- `/assets/qr/encuesta-whatsapp.png` · `.svg`
- `/assets/qr/encuesta-en-clase.png` · `.svg`
- `/assets/qr/encuesta-instagram.png` · `.svg`

Para regenerar (ex.: trocar o domínio ou adicionar canal, editando a lista
`CHANNELS` no script):

```bash
npm ci                      # se ainda não instalou as dependências
node scripts/generate-qr.mjs                        # usa geniusidiomas.com
node scripts/generate-qr.mjs https://outro-dominio  # base alternativa
```

## Ver os resultados

1. Acesse `https://geniusidiomas.com/dashboard` e faça login de admin.
2. Abra a aba **"Encuesta"**.
3. Filtros: nível (A1–C2), professor/a, canal e o período de datas do
   cabeçalho. Painéis: NPS (composição), satisfação média, respostas por
   semana, médias por pergunta, progresso percebido, conteúdos mais
   pedidos, habilidades a melhorar, visão por professor/a e os comentários
   abertos (com selo "★ Testimonio autorizado" quando o aluno permitiu uso
   no site).

O professor vem da lista fechada `PROFESOR_OPTIONS`; o agrupamento usa o
nome normalizado (minúsculas, sem acentos). Respostas antigas (v1) com
grafias diferentes podem ser unificadas direto no banco
(`survey_responses.profesorNorm`). Professores com menos de 3 respostas
aparecem sem médias (só a contagem).

## Relatórios e exportação

Na aba **"Encuesta"** do dashboard há dois botões que respeitam os filtros
ativos (nível, professor/a, canal e o período de datas do cabeçalho):

- **📄 Generar informe** — abre `/dashboard/informe.html` em outra aba:
  um relatório completo (KPIs, composição do NPS, médias por pergunta,
  distribuições, visão por professor/a, respostas por semana e todos os
  comentários) pronto para **imprimir ou salvar como PDF** pelo próprio
  navegador (botão "Imprimir / Guardar PDF"). Requer login de admin.
- **⬇ Exportar CSV** — baixa `encuesta-respuestas-<data>.csv` com **todas**
  as respostas filtradas, uma coluna por pergunta (múltiplas escolhas
  separadas por " | "). Separador `;` e BOM UTF-8, prontos para o Excel em
  espanhol/português; o Google Sheets abre direto. Endpoint:
  `GET /api/surveys/export.csv` (admin).

## Controle de respostas duplicadas

A pesquisa é anônima, então não existe garantia absoluta de "1 resposta por
pessoa". As camadas existentes:

1. **Marca no navegador** — após enviar, gravamos uma marca em
   `localStorage` + cookie (180 dias). Ao reabrir o link no mesmo
   navegador, o aluno vê "Ya respondiste esta encuesta" em vez do wizard.
   Barra o reenvio acidental/casual (aba anônima contorna).
2. **Hash de IP** — cada resposta guarda um hash com salt do IP (nunca o IP
   em si; o hash não sai da API). Respostas repetidas do mesmo hash aparecem
   no dashboard como KPI **"Posibles duplicados"** e com a flag
   `possibleDuplicate` na listagem. É só aviso — nunca bloqueia, porque
   alunos da mesma casa/rede compartilham IP.
3. **Throttle** — máx. 5 envios/min por IP + honeypot contra bots.

Se um dia for necessário garantir 1 resposta por aluno de verdade, o caminho
é link tokenizado individual (abrimos mão disso para manter o anonimato).

## Editar as perguntas

Tudo vive em `src/surveys/survey-config.ts` — etapas, textos, tipos,
obrigatoriedade e condicionais (`showIf`). Adicionar/remover pergunta é
editar esse array e fazer deploy; o wizard e a validação do backend se
ajustam sozinhos, sem migração de banco (respostas configuráveis vão para
`survey_answers`). Ex.: para cortar a pergunta de acesso ao material, remova
o bloco `materiales_acceso`. Ao remover uma pergunta que já tem respostas,
acrescente o id em `LEGACY_ANSWER_IDS` para ela continuar saindo no CSV.

Tipos de pergunta disponíveis: `nps`, `stars`, `scale5` (com `optOut`
opcional), `radio` (`variant: 'cards' | 'list'`), `checks`, `text`,
`textarea`, `selects` (cada select pode ser `required`) e `consent`.
Condicionais: `showIf: { id, equals | includes | oneOf }`.

## Deploy

Nada de novo: as tabelas são criadas automaticamente no boot
(`synchronize: true`) no mesmo `DATABASE_PATH` já usado — garanta que o
volume persistente do Coolify continua montado. Nenhuma variável de
ambiente nova é obrigatória (`SURVEY_THROTTLE_LIMIT` existe só para os
testes e2e).
