# Galeria de fotos do hero

A pedido do usuário, a home, Metodología e Sobre Nosotros agora alternam três cenas ilustrativas com pessoas diferentes. O conteúdo comercial, a paleta e a estrutura de seções foram preservados.

| Before | After | Why |
| --- | --- | --- |
| Uma única foto no hero | Três fotos, passagem a cada 8 segundos e fade de 600 ms | Mostrar diferentes cenas de aula mantendo a leitura do título e do CTA |
| Imagem estática sem controles | Seletores 01–03 e controle de pausa | Permitir ao visitante escolher e interromper a alternância |
| Um recurso prioritário | A foto inicial permanece prioritária; as demais carregam depois | Preservar o primeiro carregamento e evitar troca por imagem incompleta |
| Nenhuma alternância | Pausas por foco, seleção manual, hover, aba oculta e hero fora da tela; seleção manual com movimento reduzido | Evitar movimento durante navegação e processamento desnecessário |

As imagens novas foram geradas com a ferramenta embutida, mantendo o notebook e o professor como foco, luz quente e uma pequena bandeira brasileira apenas no cenário da chamada. A legenda informa que são representações. Os [prompts completos e arquivos](hero-gallery-images.md) registram a procedência.

## Verificação

- Testes de regressão executam o JavaScript real da galeria e simulam temporizadores, preferência de movimento, foco, visibilidade e downloads atrasados ou com falha.
- A revisão independente corrigiu dois casos: uma seleção manual não é descartada ao sair do hero durante o download; o controle de próxima foto ignora recursos que falharam.
- Conferência visual e de controles em desktop e mobile, mantendo rosto, botão de contato e seleção de fotos visíveis.
- `npm run build` aprovado; `npm test -- --runInBand`: 18 suítes e 209 testes aprovados, incluindo 13 testes da galeria; `git diff --check` limpo.
- Navegador conferido em 1440, 390 e 320 pixels de largura, sem overflow horizontal nem erros de console. A preferência de movimento reduzido estava ativa no navegador: seleção e ausência de animação verificadas nele; cadência automática, pausas e mudanças de preferência verificadas nos testes de regressão.

![Hero com a segunda cena no desktop](images/hero-gallery-desktop.jpg)

![Hero com a terceira cena no mobile](images/hero-gallery-mobile.jpg)
