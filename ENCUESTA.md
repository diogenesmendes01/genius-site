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

Os dois últimos ainda usam o mesmo questionário; para separá-los basta
registrar novas definições no motor multi-pesquisa (ver abaixo), como foi
feito com a pesquisa da equipe.

## Motor multi-pesquisa

Desde a v2 o mesmo motor serve mais de uma pesquisa. Cada uma é uma
`SurveyDefinition` (`src/surveys/survey-types.ts`) registrada em
`src/surveys/survey-registry.ts`:

| Chave | Definição | Página | Idioma |
|---|---|---|---|
| `alumnos` (padrão) | `src/surveys/survey-config.ts` | `/encuesta` | espanhol |
| `equipe` | `src/surveys/survey-equipe.ts` | `/equipe` | português |

- Todos os endpoints aceitam `?survey=<chave>`; sem ela, é a dos alunos, então
  links, QR codes e chamadas antigas continuam valendo.
- A página diz qual pesquisa é com `<body data-survey="equipe">` e reutiliza
  `/encuesta/app.js` + `/encuesta/encuesta.css`. Os textos do cascarão
  (botões, erros, agradecimento) vêm do `ui` da definição; os textos exibidos
  antes de o config chegar vêm de `data-ui-*` no `<body>`.
- A definição declara quais colunas tipadas a pesquisa pode gravar
  (`segments`, com a lista de valores aceitos), se aceita professor e
  contato (`allowProfesor`, `allowContact`), o que o dashboard agrega
  (`averages`, `distributions`, `multi`, `comments`), por quais colunas
  quebra os resultados (`breakdownBy`) e o `minGroupN` abaixo do qual nenhum
  número de grupo é exibido.
- Rascunho e marca de "já respondeu" no navegador são por pesquisa e versão
  (`genius:survey:<chave>:v2`), então quem respondeu a v1 em julho pode
  responder a v2.
- Banco: `survey_responses.survey` (padrão `alumnos`, preenchido nas linhas
  antigas) e `rol` (função, só equipe). Criadas pelo `synchronize` no boot.

## Pesquisa de clima da equipe (`/equipe`)

Pesquisa anônima em português com professores e equipe administrativa,
desenhada em outubro/2026 junto com a v2 dos alunos. ~26 perguntas em 7
etapas: função e tempo de casa (só para segmentar), satisfação geral + eNPS +
razão da nota + "me vejo aqui em 12 meses", condições de trabalho, gestão e
comunicação, desenvolvimento e reconhecimento, um bloco pedagógico (só
professores, espelhando o que os alunos disseram sobre nivelamento e
material) ou de processos (só administrativo), e quatro abertas.

**Anonimato, por desenho:**

- Nenhum campo de nome ou contato; mesmo que um cliente envie, o backend
  descarta.
- Só dois cortes (função e tempo de casa). Nenhum grupo com menos de **5**
  respostas mostra eNPS ou média (`MIN_GRUPO_N`), nem no dashboard nem no
  informe nem no CSV há como cruzar comentário com função: os comentários
  saem sem chips.
- O dashboard (aba **Equipo**) não tem filtros por pessoa; só o período de
  datas do cabeçalho.

**Link com token.** Defina `SURVEY_EQUIPE_TOKEN` no ambiente e divulgue
`https://geniusidiomas.com/equipe?t=<token>`. Sem o token no link, a página
mostra "link inválido" e o envio é recusado (403). Com a variável vazia a
página fica aberta como a dos alunos. Troque o token a cada rodada.

**Como aplicar:** mensagem da direção anunciando a pesquisa, o porquê, o
anonimato e **a data em que os resultados voltam** para a equipe; janela de
10 dias com lembrete no dia 5 e no dia 9; meta de ≥ 80% de resposta; leitura
do eNPS, 3 itens mais baixos, 3 mais altos e cruzamento com os temas dos
alunos; devolutiva com 3 compromissos e responsável; repetir em 6 meses com
as mesmas perguntas. Ideal rodar 1–2 semanas depois da pesquisa dos alunos.

Resultados: aba **Equipo** do dashboard, informe imprimível
(`/dashboard/informe.html?survey=equipe`) e CSV
(`GET /api/surveys/export.csv?survey=equipe`).

## Como funciona

| Peça | Onde |
|---|---|
| Página do aluno | `public/encuesta/` → **`https://geniusidiomas.com/encuesta`** |
| Página da equipe | `public/equipe/` → **`https://geniusidiomas.com/equipe?t=<token>`** (ver "Pesquisa de clima da equipe") |
| Perguntas (config única) | `src/surveys/survey-config.ts` (alunos) · `src/surveys/survey-equipe.ts` (equipe) · registro em `src/surveys/survey-registry.ts` |
| API | `POST /api/surveys` (público, throttle 5/min + honeypot) · `GET /api/surveys/config?survey=` (público) · `GET /api/surveys/stats`, `GET /api/surveys`, `GET /api/surveys/export.csv`, `GET /api/surveys/list` (admin, JWT); todos aceitam `?survey=alumnos\|equipe` |
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
