# Sequência de fotos do hero

A home, Metodología e Sobre Nosotros mostram três cenas ilustrativas com pessoas diferentes em uma sequência automática, parecida com um vídeo de fundo. Título, CTA, paleta e conteúdo das páginas continuam fixos.

| Before | After | Why |
| --- | --- | --- |
| Botão de fotos, pausa e seletores 01–03 visíveis | Nenhum controle de fotos visível no uso comum | Manter o hero limpo, com a aparência de vídeo solicitada |
| Fotos na sequência 1–2–3 | Ordem embaralhada, sem repetição imediata | Variar as cenas sem cair na mesma imagem duas vezes seguidas |
| Troca a cada 8 segundos, fade de 600 ms | Troca a cada 6 segundos, fade de 1,2 segundo | Dar continuidade e suavidade à passagem entre cenas |
| Hover e foco interrompiam a reprodução | Reprodução continua durante a interação com o conteúdo | Evitar que a sequência pare ao apontar para o hero ou o CTA |
| Movimento reduzido exigia seleção manual | Trocas a cada 10 segundos, apenas opacidade por 400 ms | Manter a sequência automática com um efeito mais discreto e sem movimento espacial |

A foto inicial continua prioritária; as demais carregam depois dela e só aparecem após download e decodificação. Uma falha conserva a foto atual e exclui o recurso com erro da sequência. A galeria para quando sai da tela ou a aba fica oculta. Escape pausa; um botão acessível, visível apenas quando recebe foco pelo teclado, permite pausar e retomar.

As imagens são representações geradas com a ferramenta embutida. A legenda existente foi preservada. Os [prompts completos e arquivos](hero-gallery-images.md) registram a procedência.

## Composição mobile

A imagem ocupa o fundo inteiro do hero até 767 px, com degradê navy lateral e na base. O título e a introdução ficam à esquerda; o professor aparece ao lado do conteúdo e o CTA ocupa a base. Os recortes compartilham o mesmo enquadramento entre as cenas, com ajuste específico para a terceira foto. As páginas internas seguem a mesma composição. O desktop mantém o layout anterior.

| Before | After | Why |
| --- | --- | --- |
| Foto de 310 px abaixo do texto, com espaço reservado no fim do hero | Foto integrada ao fundo inteiro | Eliminar a impressão de duas seções empilhadas |
| Texto ocupando toda a largura | Título e introdução mais estreitos no mobile | Manter leitura e rosto visíveis ao mesmo tempo |
| CTA acima da foto separada | CTA na base sobre navy | Integrar a ação à composição e manter contraste |

Os links dos dois estilos incluem versões calculadas a partir do conteúdo para evitar que o navegador misture o layout novo com CSS anterior em cache. Um teste recalcula o sha256 de cada folha e falha quando a versão do link fica para trás do arquivo. O recorte da terceira cena é aplicado pela classe `hero-slide-practice`, e não pelo nome do arquivo, porque as imagens do hero já foram renomeadas entre revisões.

## Verificação

Validação: 19 suítes e 227 testes aprovados, incluindo 15 casos de comportamento da galeria e 16 de marcação; `npm run build` e `git diff --check` limpos.

Os testes executam o JavaScript real com temporizadores, aleatoriedade controlada, preferências de movimento, visibilidade e carregamentos atrasados ou com falha. A conferência no navegador cobre alternância automática, ausência dos controles visíveis e recortes no desktop e no mobile. O ajuste visual mobile foi conferido em 320, 390 e 430 px nas três páginas, incluindo fotos diferentes durante a reprodução; desktop conferido em 1440 px. Essa alteração de CSS não modifica o JavaScript da galeria.

Os casos de marcação leem as três páginas publicadas e cobrem o outro lado do contrato, que o teste de comportamento não alcança: a inclusão do script, a raiz da galeria, uma única foto ativa com prioridade de carregamento, as demais atrás de `data-src` e com `aria-hidden`, a existência dos arquivos citados, o botão de pausa iniciando oculto e as versões dos estilos.

![Hero no desktop sem controles visíveis](images/hero-gallery-desktop.jpg)

![Hero no mobile sem controles visíveis](images/hero-gallery-mobile.jpg)
