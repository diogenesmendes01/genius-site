# SEO e descoberta por assistentes — GENIUS

Implementação de 17/09/2026. Público: estudantes de toda a América Latina; conteúdo em espanhol. Origem canônica: `https://www.geniusidiomas.com`.

## O que mudou

| Antes | Agora | Motivo |
| --- | --- | --- |
| Informações do curso distribuídas em cards e disclosures | [Página do curso](https://www.geniusidiomas.com/curso-portugues-online.html) com tabela dos quatro ritmos, particulares e perguntas reais | Dar uma referência clara para comparar dedicação, duração e contratação |
| Títulos genéricos e uma organização sem identidade estável | Títulos próprios e JSON-LD ligado por `@id` nas quatro páginas | Relacionar escola, site, páginas e curso sem inventar credenciais |
| Ofertas diretamente em `EducationalOrganization.offers` | Um `Course` com quatro `CourseInstance` e um `Service` para particulares | Representar os formatos reais; não apresentar ritmos como cursos independentes |
| Home disponível também em `/index.html` e domínio sem www | 301 nas URLs de marketing conhecidas para a origem canônica | Consolidar duplicatas preservando parâmetros de campanha |
| Matrícula e confirmação sem instrução de indexação | Meta `noindex` e cabeçalho `X-Robots-Tag` nas áreas operacionais | Manter transações e APIs fora dos resultados, sem alterar acesso e autenticação |
| Caminho inexistente com duplo slash retornava 500 | Fallback estático restrito à raiz; inexistentes retornam 404 | Evitar erro de servidor e indexação de URLs sem conteúdo |
| FAQ da home dependia de JS para leitura | Respostas visíveis no HTML; JS inicializa o acordeão | Preservar conteúdo quando o script não estiver disponível |

A home mantém o hero, os textos de venda e as modalidades aprovadas. A nova página reutiliza as cores e a tipografia existentes, tem tabela rolável por teclado no celular e FAQ nativa com um item aberto por vez. Links para ela foram incluídos na home, metodologia e rodapés. O WhatsApp e a área de atendimento estão visíveis e coerentes com o JSON-LD.

## Regras de manutenção

- Páginas públicas: `/`, `/curso-portugues-online.html`, `/metodologia.html`, `/sobre-nos.html`. Cada uma tem título, descrição, canonical, Open Graph e Twitter Card próprios. O sitemap lista somente essas URLs.
- `lastmod` representa alteração real da página; não atualizar automaticamente a cada deploy.
- Preservar os códigos existentes de verificação do Search Console.
- Não criar variações quase idênticas por país. Há uma página em espanhol para a região, sem versões locais inventadas ou `hreflang` apontando para páginas inexistentes.
- Durações são aproximadas. Valores, datas de turmas, notas, endereços e credenciais não entram no schema enquanto não houver informação pública confirmada. Os pacotes particulares são totais de horas, não duração de cada aula.
- A identidade da escola (`/#organization`) e do site (`/#website`) deve permanecer igual nas quatro páginas. O curso é identificado em `/curso-portugues-online.html#course`.
- `Course` é uma descrição semântica; não há promessa de carrossel ou resultado destacado. A FAQ serve às pessoas: não foi acrescentado `FAQPage` visando um recurso de rich result descontinuado.
- O robots permite rastreamento público pela regra `User-agent: *`, inclusive bots de busca com IA. Não criar grupos específicos que acidentalmente ignorem as exclusões comuns. As regras de treinamento não foram alteradas.
- HTML com `noindex` precisa continuar rastreável para que o buscador leia a instrução. `noindex` não substitui autenticação. O bloqueio de `/api/` já existente foi preservado; seu cabeçalho funciona como instrução adicional para clientes que possam lê-lo.
- Redirecionamentos do middleware afetam somente GET/HEAD de caminhos públicos conhecidos, em hosts exatos da marca. API, formulários POST, matrícula e prévias locais conservam seu comportamento. A borda de produção já redireciona HTTP para HTTPS.
- CSS com hash na URL usa LF via `.gitattributes`, para manter os mesmos bytes no Windows e no CI. Ao editar um CSS, atualizar seu SHA-256 abreviado (10 caracteres) nos HTMLs que o importam.

## Depois da publicação

Estas ações dependem do deploy e das contas da escola; não foram executadas pela alteração de código.

1. No Search Console já utilizado pela escola, reenviar `https://www.geniusidiomas.com/sitemap.xml`. Inspecionar as quatro páginas, verificar a canonical selecionada pelo Google e solicitar indexação das páginas alteradas. Conferir também a remoção das páginas transacionais ao longo dos próximos rastreamentos.
2. Em **Configurações → Search generative AI**, conferir se a propriedade está incluída. O Google lançou esse controle em agosto de 2026; uma exclusão pode ser herdada de uma propriedade pai. Não alterar preferências de conta sem revisar seu efeito.
3. Conferir em produção os redirects de `/index.html` e do domínio sem www, o 404 de caminhos inexistentes e os `noindex`. A configuração do proxy pode afetar o cabeçalho Host observado pela aplicação.
4. Validar a página do curso no [Schema Markup Validator](https://validator.schema.org/) para vocabulário e inspecionar o HTML recebido pelo Google no Search Console. Validade semântica não equivale a elegibilidade para um recurso específico de busca.
5. Usar o Bing Webmaster Tools, caso já esteja conectado ou seja configurado pela escola, para sitemap/indexação no ecossistema Bing. IndexNow pode ser avaliado depois; não foi criado token nem cadastro nesta mudança.
6. Verificar no CDN/WAF que Googlebot, OAI-SearchBot, PerplexityBot e Claude-SearchBot reais não recebam bloqueios. As requisições de diagnóstico com esses nomes de User-Agent retornaram HTML 200 em 17/09/2026; isso não comprova acesso de todos os IPs oficiais nem indexação.

## Como medir

Registrar uma linha de base no Search Console antes da publicação. Comparar períodos equivalentes após haver novo rastreamento: impressões, cliques, CTR e posição por página, país e consulta. Separar buscas de marca (GENIUS) das buscas de categoria (por exemplo, classes/curso de português online, professores brasileiros, modalidade intensiva). Tráfego isolado não mede matrícula: cruzar com contatos e inscrições reais usando o processo de medição já adotado pela escola.

O objetivo é acompanhar toda a América Latina e identificar onde há demanda, sem supor que listar países crie presença local. Conteúdo futuro deve partir das dúvidas e consultas reais: exemplos próprios de aula, explicações de professores identificados e depoimentos autorizados e verificáveis. Não há promessa de prazo para ranking ou citação em respostas de IA.

## Verificação de código

`npm test -- --runInBand`: **21 suítes e 277 testes aprovados**, cobrindo rotas HTTP reais, metadata/canonical, referências JSON-LD, links e fragmentos, sitemap, FAQ e comportamento existente. `npm run build`: aprovado.

O JSON-LD completo da página do curso foi enviado como snippet ao Schema Markup Validator em 17/09/2026: **0 erros e 0 avisos**, incluindo as entidades ligadas de escola, site, curso, modalidades, particulares e breadcrumbs. Isso valida o vocabulário; a indexação da URL publicada ainda depende dos buscadores.

O helper de testes fornece o ExpressAdapter antes de compilar o módulo; assim o ServeStatic usa seu loader real, em vez de ignorar arquivos estáticos nos testes. A inspeção visual incluiu desktop e celular, abertura exclusiva da FAQ e rolagem da tabela por teclado.

## Fontes consultadas

- [Artigo enviado pelo usuário — PYXYS](https://pyxys.com.br/geo-aio-e-llmo): contexto de GEO/AIO/LLMO, voltado a publishers. Não usar schemas jornalísticos em uma escola.
- [Google: otimização para IA na busca](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide): SEO continua como fundamento; não há schema especial para GEO, e `llms.txt` não melhora a visibilidade no Google.
- [Google: políticas de dados estruturados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies): dados devem refletir o conteúdo e os fatos apresentados ao visitante.
- [Google: alterações na documentação](https://developers.google.com/search/updates): FAQ rich results descontinuados em maio de 2026.
- [Google: controle de Search generative AI](https://support.google.com/webmasters/answer/16908024).
- [OpenAI: crawlers](https://developers.openai.com/api/docs/bots): busca e treinamento têm controles distintos.
- [Bing: Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a).
- [Perplexity: crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).
- [Anthropic: acesso dos crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler).
