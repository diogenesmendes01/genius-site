# Como Criar a Imagem Open Graph (og-image.jpg)

## Problema
Quando você compartilha o link no WhatsApp, não aparece a imagem porque o arquivo `og-image.jpg` não existe.

## Solução Rápida (3 métodos)

### Método 1: Conversor Online (Mais Rápido)
1. Acesse: https://cloudconvert.com/svg-to-jpg
2. Faça upload do arquivo: `public/assets/social/og-image.svg`
3. Clique em "Convert"
4. Baixe o arquivo `og-image.jpg`
5. Coloque em: `public/assets/social/og-image.jpg`

### Método 2: Abrir no Navegador e Screenshot
1. Abra `public/assets/social/og-image.svg` no Chrome/Edge
2. Pressione F12 (DevTools)
3. No Console, cole:
```javascript
const canvas = document.createElement('canvas');
canvas.width = 1200;
canvas.height = 630;
const ctx = canvas.getContext('2d');
const img = new Image();
img.onload = () => {
  ctx.drawImage(img, 0, 0);
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'og-image.jpg';
    a.click();
  }, 'image/jpeg', 0.95);
};
img.src = 'data:image/svg+xml;base64,' + btoa(document.documentElement.outerHTML);
```
4. Salve o arquivo baixado em `public/assets/social/og-image.jpg`

### Método 3: Usar Canva (Mais Profissional)
1. Acesse: https://www.canva.com/
2. Crie um design customizado: 1200 x 630 px
3. Design recomendado:
   - Fundo: Navy (#000E38)
   - Texto principal: "GENIUS" em Gold (#DCAF63), tamanho grande
   - Subtexto: "Academia de Lenguas" em branco
   - Slogan: "Habla Português con Fluidez en 2 Años"
   - Badge: "Primera Clase Gratis" com fundo Gold
4. Adicione a logo GENIUS (use `public/assets/logo-genius.png`)
5. Exporte como JPG
6. Salve em: `public/assets/social/og-image.jpg`

## Especificações Técnicas
- **Formato:** JPG
- **Dimensões:** 1200 x 630 pixels
- **Tamanho:** Máximo 8MB (ideal: 100-300KB)
- **Cores da marca:**
  - Navy: #000E38
  - Gold: #DCAF63
  - Branco: #FFFFFF

## Após Criar
1. Coloque o arquivo em: `public/assets/social/og-image.jpg`
2. Teste o link no WhatsApp (pode levar alguns minutos para atualizar o cache)
3. Se não aparecer imediatamente, use: https://developers.facebook.com/tools/debug/

## Verificar se Funcionou
1. Acesse: https://developers.facebook.com/tools/debug/
2. Cole a URL do seu site: https://geniusacademia.com
3. Clique em "Debug" para ver como o Facebook/WhatsApp vê seu site
4. Se a imagem aparecer, está funcionando! ✅

## Cache do WhatsApp
O WhatsApp pode cachear o preview antigo. Para forçar atualização:
- Use o Facebook Debugger (link acima) e clique em "Scrape Again"
- Ou aguarde algumas horas
