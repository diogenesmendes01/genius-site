# Encuesta de Satisfação dos Alunos

Pesquisa anônima em espanhol, em formato wizard de 6 etapas, com resultados
numa aba dedicada do dashboard admin. Nenhum dado vem do Q10 — tudo é
auto-declarado pelo aluno e fica no SQLite local.

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

O nome do professor é texto livre digitado pelo aluno; o agrupamento usa o
nome normalizado (minúsculas, sem acentos). Grafias que não se unirem
sozinhas podem ser corrigidas direto no banco (`survey_responses.profesorNorm`).

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
`survey_answers`). Ex.: para cortar a P12, remova o bloco
`online_efectividad`.

## Deploy

Nada de novo: as tabelas são criadas automaticamente no boot
(`synchronize: true`) no mesmo `DATABASE_PATH` já usado — garanta que o
volume persistente do Coolify continua montado. Nenhuma variável de
ambiente nova é obrigatória (`SURVEY_THROTTLE_LIMIT` existe só para os
testes e2e).
