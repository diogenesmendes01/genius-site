/**
 * Pesquisa de clima da EQUIPE (professores + administrativo/comercial),
 * registrada como `equipe` em survey-registry.ts e servida em /equipe.
 *
 * Em português (equipe brasileira). Anônima por desenho:
 *   - nenhum campo de nome/contato (allowContact: false);
 *   - só dois cortes de segmentação (função e tempo de casa), e o dashboard
 *     não mostra número algum de um grupo com menos de MIN_GRUPO_N respostas;
 *   - os comentários aparecem sem chips de função/tempo (commentMeta: false).
 *
 * Acesso: se a variável de ambiente SURVEY_EQUIPE_TOKEN estiver definida, o
 * link precisa trazer `?t=<token>` (o wizard repassa no envio). Sem a
 * variável, a página fica aberta como a dos alunos.
 */

import { SurveyDefinition, SurveyQuestion, SurveyStep, SurveyUiStrings } from './survey-types';

export const ROL_PROFESSOR = 'Professor/a';
export const ROL_ADMIN = 'Equipe administrativa, comercial ou gestão';
export const ROL_OPTIONS = [ROL_PROFESSOR, ROL_ADMIN];

export const TEMPO_OPTIONS = [
  'Menos de 6 meses',
  'De 6 meses a 1 ano',
  'De 1 a 2 anos',
  'Mais de 2 anos',
];

/** Abaixo disso, nenhum número por função/tempo é exibido. */
export const MIN_GRUPO_N = 5;

const CONCORDA = [
  'Discordo totalmente',
  'Discordo',
  'Neutro',
  'Concordo',
  'Concordo totalmente',
];

const NAO_SE_APLICA = 'Não se aplica';

/** Item de concordância 1–5 (obrigatório por padrão). */
function item(
  id: string,
  text: string,
  extra: Partial<SurveyQuestion> = {},
): SurveyQuestion {
  return {
    id,
    type: 'scale5',
    store: 'answers',
    required: true,
    text,
    labels: CONCORDA,
    ...extra,
  };
}

export const EQUIPE_UI: SurveyUiStrings = {
  lang: 'pt-BR',
  loading: 'Carregando pesquisa…',
  loadError: 'Não conseguimos carregar a pesquisa. Recarregue a página ou tente mais tarde.',
  forbidden: 'Este link não é válido. Peça à direção o link correto da pesquisa.',
  back: '← Voltar',
  next: 'Continuar →',
  submit: 'Enviar respostas',
  sending: 'Enviando…',
  requiredAlert: 'Responda as perguntas marcadas com * antes de continuar.',
  tooMany: 'Muitos envios seguidos. Espere um minuto e tente de novo.',
  sendError: 'Houve um erro ao enviar suas respostas. Tente novamente.',
  thanksTitle: 'Obrigado por responder!',
  thanksBody:
    'Suas respostas foram enviadas de forma anônima. Os resultados serão compartilhados com toda a equipe, junto com as ações combinadas.',
  doneTitle: 'Você já respondeu esta pesquisa',
  doneBody: 'Obrigado! Cada pessoa responde uma única vez.',
  privacy:
    'A pesquisa é anônima: não guardamos nome, e-mail nem qualquer identificação. ' +
    'Os resultados são lidos sempre em conjunto e nenhum grupo com menos de 5 respostas é exibido.',
  charHint: 'máx. {n} caracteres',
};

export const EQUIPE_STEPS: SurveyStep[] = [
  {
    id: 'sobre_voce',
    label: 'Você',
    title: 'Sobre você',
    sub: 'Só para ler as respostas em conjunto. Nada disso identifica ninguém.',
    questions: [
      {
        id: 'rol',
        type: 'radio',
        variant: 'cards',
        store: 'column',
        required: true,
        text: 'Qual é a sua função na Genius?',
        options: ROL_OPTIONS,
      },
      {
        id: 'tempo',
        type: 'selects',
        store: 'column',
        selects: [
          {
            id: 'tiempo',
            label: 'Há quanto tempo você está na Genius?',
            required: true,
            options: ['Selecione…', ...TEMPO_OPTIONS],
          },
        ],
      },
    ],
  },
  {
    id: 'geral',
    label: 'Geral',
    title: 'Visão geral',
    sub: 'As três perguntas mais importantes.',
    questions: [
      {
        id: 'csat',
        type: 'stars',
        store: 'column',
        required: true,
        text: 'No geral, quão satisfeito(a) você está em trabalhar na Genius?',
        labels: [
          'Muito insatisfeito(a)',
          'Insatisfeito(a)',
          'Neutro',
          'Satisfeito(a)',
          'Muito satisfeito(a)',
        ],
      },
      {
        id: 'nps',
        type: 'nps',
        store: 'column',
        required: true,
        text: 'Qual a probabilidade de você recomendar a Genius como lugar para trabalhar a um colega da área?',
        ends: ['Nada provável', 'Muito provável'],
      },
      {
        id: 'nps_motivo',
        type: 'textarea',
        store: 'answers',
        required: true,
        maxLength: 300,
        text: 'Qual é a razão principal da sua nota?',
        placeholder: 'Uma ou duas frases bastam…',
      },
      item('permanencia', 'Me vejo trabalhando na Genius daqui a 12 meses.'),
    ],
  },
  {
    id: 'condicoes',
    label: 'Condições',
    title: 'Condições de trabalho',
    sub: 'Remuneração, previsibilidade, carga e ferramentas.',
    questions: [
      item('remuneracao', 'Minha remuneração é justa pelo trabalho que faço.'),
      item('pagamentos_prazo', 'Os pagamentos chegam na data combinada.', { optOut: NAO_SE_APLICA }),
      item(
        'previsibilidade',
        'Tenho previsibilidade sobre minhas turmas e horários com antecedência suficiente.',
        { optOut: NAO_SE_APLICA },
      ),
      item('carga', 'A carga de trabalho é sustentável.'),
      item(
        'ferramentas',
        'Tenho as ferramentas que preciso (plataforma de aula, material, acesso a sistemas) funcionando bem.',
      ),
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    title: 'Gestão e comunicação',
    sub: 'Expectativas, feedback, avisos e decisões.',
    questions: [
      item('expectativas', 'Sei exatamente o que se espera de mim.'),
      item('feedback', 'Recebo feedback útil sobre meu trabalho com regularidade.'),
      item('mudancas', 'Fico sabendo das mudanças (horários, alunos, regras) antes que elas me afetem.'),
      item('problemas', 'Quando levanto um problema, ele é tratado em tempo razoável.'),
      item('decisoes', 'As decisões da escola são explicadas, mesmo quando eu não concordo.'),
    ],
  },
  {
    id: 'desenvolvimento',
    label: 'Crescimento',
    title: 'Desenvolvimento e reconhecimento',
    questions: [
      item('desenvolvimento', 'Tenho oportunidades de me desenvolver profissionalmente aqui.'),
      item('reconhecimento', 'Meu trabalho é reconhecido.'),
      item('autonomia', 'Tenho autonomia para fazer meu trabalho do meu jeito dentro do método.'),
      item('orgulho', 'Sinto orgulho de trabalhar na Genius.'),
    ],
  },
  {
    id: 'trabalho',
    label: 'Seu trabalho',
    title: 'O dia a dia do seu trabalho',
    sub: 'As perguntas mudam conforme a sua função.',
    questions: [
      // ── só professores ──
      item(
        'ped_material',
        'O material didático é adequado e os alunos têm acesso a ele fora da aula.',
        { showIf: { id: 'rol', equals: ROL_PROFESSOR } },
      ),
      item(
        'ped_nivel_clareza',
        'Consigo dizer com clareza a cada aluno em que nível está e o que falta para avançar.',
        { showIf: { id: 'rol', equals: ROL_PROFESSOR } },
      ),
      item('ped_nivelamento', 'O processo de nivelamento dos alunos novos funciona bem.', {
        showIf: { id: 'rol', equals: ROL_PROFESSOR },
      }),
      item('ped_turmas', 'O tamanho das turmas permite dar atenção a todos.', {
        showIf: { id: 'rol', equals: ROL_PROFESSOR },
      }),
      item(
        'ped_dificuldade',
        'Sei o que fazer quando um aluno tem dificuldade, falta muito ou está insatisfeito.',
        { showIf: { id: 'rol', equals: ROL_PROFESSOR } },
      ),
      item('ped_troca', 'Tenho espaço para trocar experiências com outros professores.', {
        showIf: { id: 'rol', equals: ROL_PROFESSOR },
      }),
      // ── só administrativo / comercial / gestão ──
      item(
        'adm_processos',
        'Os processos (matrícula, cobrança, alocação em turma) são claros e documentados.',
        { showIf: { id: 'rol', equals: ROL_ADMIN } },
      ),
      item(
        'adm_informacao',
        'Tenho as informações que preciso para atender aluno e professor sem depender de outra pessoa.',
        { showIf: { id: 'rol', equals: ROL_ADMIN } },
      ),
      item('adm_prazo', 'Consigo responder aos alunos no prazo que a escola promete.', {
        showIf: { id: 'rol', equals: ROL_ADMIN },
      }),
      item(
        'adm_ferramentas',
        'As ferramentas (ERP, WhatsApp, planilhas) ajudam mais do que atrapalham.',
        { showIf: { id: 'rol', equals: ROL_ADMIN } },
      ),
    ],
  },
  {
    id: 'final',
    label: 'Final',
    title: 'Para terminar',
    sub: 'Tudo nesta página é opcional, mas é a parte que mais ajuda.',
    questions: [
      {
        id: 'manter',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: 'O que a Genius faz bem e deve manter?',
        placeholder: 'Escreva aqui… (opcional)',
      },
      {
        id: 'mudar',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: 'Se você pudesse mudar uma coisa amanhã, qual seria?',
        placeholder: 'Escreva aqui… (opcional)',
      },
      {
        id: 'alunos_pedem',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: 'O que os alunos pedem ou reclamam com você e a escola ainda não resolve?',
        placeholder: 'Escreva aqui… (opcional)',
      },
      {
        id: 'mais',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: 'Algo mais que queira dizer?',
        placeholder: 'Escreva aqui… (opcional)',
      },
    ],
  },
];

/** Every scale item, in questionnaire order, labelled for the dashboard. */
const EQUIPE_AVERAGES: Record<string, string> = {
  permanencia: 'Me vejo aqui em 12 meses',
  remuneracao: 'Remuneração justa',
  pagamentos_prazo: 'Pagamentos no prazo',
  previsibilidade: 'Previsibilidade de turmas/horários',
  carga: 'Carga sustentável',
  ferramentas: 'Ferramentas funcionam',
  expectativas: 'Sei o que se espera de mim',
  feedback: 'Recebo feedback útil',
  mudancas: 'Sei das mudanças antes',
  problemas: 'Problemas tratados a tempo',
  decisoes: 'Decisões explicadas',
  desenvolvimento: 'Oportunidade de desenvolvimento',
  reconhecimento: 'Trabalho reconhecido',
  autonomia: 'Autonomia dentro do método',
  orgulho: 'Orgulho de trabalhar aqui',
  ped_material: 'Prof: material adequado e acessível',
  ped_nivel_clareza: 'Prof: clareza do nível do aluno',
  ped_nivelamento: 'Prof: nivelamento funciona',
  ped_turmas: 'Prof: tamanho das turmas',
  ped_dificuldade: 'Prof: sei agir com aluno em dificuldade',
  ped_troca: 'Prof: troca entre professores',
  adm_processos: 'Adm: processos claros',
  adm_informacao: 'Adm: informação sem depender',
  adm_prazo: 'Adm: respondo no prazo',
  adm_ferramentas: 'Adm: ferramentas ajudam',
};

export const EQUIPE_SURVEY: SurveyDefinition = {
  key: 'equipe',
  name: 'Pesquisa de Clima da Equipe',
  ui: EQUIPE_UI,
  steps: EQUIPE_STEPS,
  segments: {
    rol: { label: 'Função', options: ROL_OPTIONS },
    tiempo: { label: 'Tempo de casa', options: TEMPO_OPTIONS },
  },
  breakdownBy: ['rol', 'tiempo'],
  allowProfesor: false,
  allowContact: false,
  minGroupN: MIN_GRUPO_N,
  commentMeta: false,
  comments: {
    nps_motivo: 'Razão da nota',
    manter: 'O que manter',
    mudar: 'O que mudar',
    alunos_pedem: 'O que os alunos pedem',
    mais: 'Algo mais',
  },
  averages: EQUIPE_AVERAGES,
  distributions: {},
  multi: {},
  legacyAnswerIds: [],
  accessTokenEnv: 'SURVEY_EQUIPE_TOKEN',
};
