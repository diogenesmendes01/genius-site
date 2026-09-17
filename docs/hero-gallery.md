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

## Verificação

Validação: 18 suítes e 211 testes aprovados, incluindo 15 casos da galeria; `git diff --check` limpo.

Os testes executam o JavaScript real com temporizadores, aleatoriedade controlada, preferências de movimento, visibilidade e carregamentos atrasados ou com falha. A conferência no navegador cobre alternância automática, ausência dos controles visíveis e recortes no desktop e no mobile.

![Hero no desktop sem controles visíveis](images/hero-gallery-desktop.jpg)

![Hero no mobile sem controles visíveis](images/hero-gallery-mobile.jpg)
