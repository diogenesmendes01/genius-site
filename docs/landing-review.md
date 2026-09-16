# Resposta técnica à revisão da PR #23

Revisão de referência: [comentário de 16/09/2026](https://github.com/diogenesmendes01/genius-site/pull/23#issuecomment-5702197976).

| Before | After | Why |
| --- | --- | --- |
| Qualquer tecla suspendia novas animações. | Tab suspende entradas e cancela as que estão em curso; PageDown, Espaço e setas mantêm o scroll reveal. | Preservar foco visível sem mudar a rolagem por teclado. |
| Atraso calculado pelo índice total do card no grid. | Atraso apenas entre elementos da mesma linha e lote, limitado a 200 ms; no mobile é zero. | Um card isolado não herda espera dos anteriores. |
| Observer iniciava o fade após 12% do elemento aparecer. | Entrada começa 80 px antes do viewport; conteúdo já visível não é apagado para animar. | Evitar o flash e a interrupção da leitura. |
| Preferência de movimento reduzido tratada apenas ao ativar. | Cancelamento ao ativar, limpeza dos estados da FAQ ao desativar e observer disponível mesmo quando a página inicia com a preferência ativa. | A preferência funciona nos dois sentidos durante a sessão. |
| Scroll customizado usava `instant` e cancelava o link antes de tentar. | `auto` com scroll CSS imediato para teclado/movimento reduzido; default nativo preservado se a chamada falhar. | Manter âncoras e skip link utilizáveis. |
| CTA fixo fazia leitura/escrita em cada evento de scroll. | Atualização agrupada por frame, retorno antecipado em desktop e escrita somente quando o estado muda. | Evitar trabalho repetido para uma barra que pode estar oculta. |
| Cor antiga no tile e descrição curta em Sobre Nosotros. | Navy `#0B1C3A` no XML e descrição completa em SEO, Open Graph e Twitter. | Manter marca e contexto institucional fora do corpo da página. |
| Manifesto coberto pelo bloqueio genérico de JSON. | Exceção `Allow: /manifest.json`, mantendo bloqueio de API e demais JSON. | Permitir o recurso público vinculado pelas páginas. |
| Classes sem uso e comentário de CSS com nome de arquivo antigo. | Remoção dos marcadores sem regra e comentário com os arquivos atuais. | Evitar pistas falsas na manutenção. |
| Erro HTTP ou resposta vazia no QA ainda terminava com sucesso. | Step de análise termina com código 1 e preserva o diagnóstico para comentário/notificação. | Um serviço de revisão indisponível não representa QA aprovado. |

## Decisões preservadas

O CTA sempre visível da Semi-intensiva e os CTAs de Regular/Intensiva dentro dos detalhes reproduzem a hierarquia da referência aprovada: um destaque principal na comparação. A regra `.course > .button` é destinada ao card destacado. Os botões alternativos continuam disponíveis ao abrir “Ver más detalles”; não foram adicionados três botões concorrentes à dobra.

O backend de leads e os arquivos antigos de frontend permanecem por compatibilidade. A landing atual converte pelo WhatsApp e não chama `/api/leads`; a documentação não pressupõe a existência de outro consumidor.

## Dependência externa do QA

O job usa o secret existente `ANTHROPIC_API_KEY`. O HTTP 401 observado indica que a API recusou a autenticação. Esta alteração torna o resultado do job fiel à falha, mas não troca credenciais. O secret precisa ser corrigido nas configurações do repositório antes de uma nova execução conseguir realizar a análise remota.

As verificações locais de frontend e os testes do projeto são independentes desse serviço. Build aprovado e 17 suítes/196 testes passaram, incluindo 12 regressões de frontend. A lógica do workflow foi validada localmente em 14 cenários simulados, sem chamadas à API. No navegador, foram conferidos o skip link por teclado, a abertura dos CTAs nos detalhes, a FAQ com um item aberto por vez e a barra fixa mobile.
