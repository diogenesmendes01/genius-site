# 📝 Próximos Passos - GENIUS Academia de Lenguas

## ✅ Já Implementado

### Funcionalidades Completas
- ✅ Estrutura HTML completa e semântica
- ✅ CSS responsivo com design system completo
- ✅ JavaScript interativo (seletor de país, formulário, animações)
- ✅ Meta tags completas (SEO, OpenGraph, Twitter Cards)
- ✅ Structured data (JSON-LD) para SEO
- ✅ PWA manifest (site.webmanifest)
- ✅ Acessibilidade (ARIA labels, roles)
- ✅ Animações suaves e micro-interações
- ✅ Botão flutuante do WhatsApp (ativado)
- ✅ Scroll animations com Intersection Observer
- ✅ Favicon SVG criado
- ✅ Badges SVG criados (rating, students, award)
- ✅ OG Image SVG placeholder

## 🎯 Assets Pendentes (Alta Prioridade)

### 1. Hero Images - 7 Imagens
Criar ou obter fotos para cada país:

```
📁 assets/images/
  ├─ hero-cr.webp  (1920×1080) - Costa Rica
  ├─ hero-pa.webp  (1920×1080) - Panamá
  ├─ hero-sv.webp  (1920×1080) - El Salvador
  ├─ hero-hn.webp  (1920×1080) - Honduras
  ├─ hero-ni.webp  (1920×1080) - Nicaragua
  ├─ hero-gt.webp  (1920×1080) - Guatemala
  └─ hero-bz.webp  (1920×1080) - Belize
```

**Onde obter:**
- Unsplash: https://unsplash.com/s/photos/education
- Pexels: https://www.pexels.com/search/students/
- Ou contratar sessão fotográfica profissional

**Requisitos:**
- Estudantes felizes aprendendo
- Diversidade étnica (latinos)
- Luz natural, ambiente moderno
- Peso máximo: 250KB cada

### 2. Fotos de Cursos - 3 Imagens

```
📁 assets/images/
  ├─ course-business.webp (800×600) - Profissional em reunião
  ├─ course-travel.webp   (800×600) - Pessoa explorando
  └─ course-exam.webp     (800×600) - Estudante focado
```

**Peso máximo:** 150KB cada

### 3. Favicons em PNG

Converter o `assets/favicon/favicon.svg` para PNG:

```
📁 assets/favicon/
  ├─ favicon-16x16.png
  ├─ favicon-32x32.png
  ├─ apple-touch-icon.png      (180×180)
  ├─ android-chrome-192x192.png
  └─ android-chrome-512x512.png
```

**Ferramenta recomendada:**
- Online: https://realfavicongenerator.net/
- Ou: https://favicon.io/

### 4. Logo da Escola (se não existir)

```
📁 assets/logo/
  ├─ logo-horizontal-color.svg
  ├─ logo-horizontal-white.svg
  ├─ logo-vertical-color.svg
  ├─ logo-icon-color.svg
  └─ logo-icon-white.svg
```

**Nota:** O site já usa um logo SVG inline no header, mas você pode criar versões oficiais.

## 📱 Configurações Obrigatórias

### 1. Números de WhatsApp por País

Editar `script.js` (linhas 82-111):

```javascript
const countryContent = {
  cr: {
    phone: '+506-xxxx-xxxx',        // ⚠️ ATUALIZAR
    whatsapp: 'https://wa.me/506xxxxxxxx'  // ⚠️ ATUALIZAR
  },
  pa: {
    phone: '+507-xxxx-xxxx',        // ⚠️ ATUALIZAR
    whatsapp: 'https://wa.me/507xxxxxxxx'  // ⚠️ ATUALIZAR
  },
  // ... atualizar todos os países
};
```

### 2. Links das Redes Sociais

Editar `index.html` (linhas 561-577):

```html
<!-- Footer Social Links -->
<a href="https://facebook.com/geniusacademia" ...>  <!-- ⚠️ ATUALIZAR -->
<a href="https://instagram.com/geniusacademia" ...> <!-- ⚠️ ATUALIZAR -->
```

### 3. Email de Contato

Editar `index.html` (linha 65):

```json
"email": "info@geniusacademia.com"  // ⚠️ ATUALIZAR
```

### 4. Domínio do Site

Substituir `https://geniusacademia.com` pelo domínio real em:
- `index.html`: Meta tags OpenGraph (linhas 19, 30)
- `index.html`: Canonical URL (linha 36)
- `index.html`: Structured data (linhas 60-139)

### 5. Backend do Formulário

Editar `script.js` (linha 179):

```javascript
// Substituir simulação por chamada real à API
await fetch('https://seu-backend.com/api/leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

## 🚀 Deployment

### Pré-Deploy Checklist

- [ ] Todos os assets de imagens otimizados
- [ ] Números de WhatsApp atualizados
- [ ] Links de redes sociais atualizados
- [ ] Domínio configurado em todas as URLs
- [ ] Backend do formulário integrado
- [ ] SSL/HTTPS configurado
- [ ] Google Analytics adicionado (opcional)

### Como Fazer Deploy

#### Opção 1: Netlify (Recomendado)
```bash
# 1. Criar conta em netlify.com
# 2. Conectar repositório Git
# 3. Deploy automático!
```

#### Opção 2: Vercel
```bash
npx vercel
```

#### Opção 3: GitHub Pages
1. Push para GitHub
2. Settings > Pages
3. Source: main branch

#### Opção 4: Hosting Tradicional (cPanel)
1. Fazer upload via FTP
2. Extrair em public_html/
3. Pronto!

## 🎨 Assets Opcionais (Média Prioridade)

### Fotos de Depoimentos - 6-8 Retratos

```
📁 assets/images/
  ├─ student-maria.webp   (400×400)
  ├─ student-carlos.webp  (400×400)
  ├─ student-ana.webp     (400×400)
  ├─ student-joao.webp    (400×400)
  ├─ student-laura.webp   (400×400)
  └─ student-diego.webp   (400×400)
```

**Nota:** Atualmente usa gradientes placeholder que ficam bem!

### Logos de Parceiros

```
📁 assets/partners/
  ├─ partner-celpe-bras.svg
  ├─ partner-diple.svg
  ├─ partner-mec-brasil.svg
  └─ ... outros
```

### Converter OG Image para JPG

```bash
# Converter og-image.svg para og-image.jpg (1200×630)
# Usar: https://cloudconvert.com/svg-to-jpg
# Ou: Photoshop/Illustrator
```

## 📊 Analytics (Opcional mas Recomendado)

### Google Analytics

Adicionar antes do `</head>` em `index.html`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Facebook Pixel

```html
<!-- Facebook Pixel -->
<script>
  !function(f,b,e,v,n,t,s){...}
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

### Microsoft Clarity (Gratuito)

```html
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "YOUR_PROJECT_ID");
</script>
```

## ⚡ Otimizações Futuras

### Performance
- [ ] Minificar CSS e JS para produção
- [ ] Lazy loading nas imagens
- [ ] Comprimir imagens com TinyPNG
- [ ] Implementar service worker para PWA

### SEO
- [ ] Criar sitemap.xml
- [ ] Criar robots.txt
- [ ] Adicionar dados estruturados de cursos
- [ ] Blog para content marketing

### Funcionalidades
- [ ] Chatbot (Tawk.to ou Intercom)
- [ ] Sistema de agendamento de aulas
- [ ] Área de login para alunos
- [ ] Certificados digitais

## 📞 Contato para Dúvidas

Se precisar de ajuda com qualquer etapa:
- Email: desenvolvimento@geniusacademia.com
- Consulte o README.md para detalhes técnicos
- Veja o DESIGN_BRIEF para especificações visuais

## 🎉 Conclusão

O site está **funcional e pronto para uso**! Apenas faltam:

### CRÍTICO (Fazer antes do deploy):
1. ⚠️ Atualizar números de WhatsApp
2. ⚠️ Atualizar links de redes sociais
3. ⚠️ Integrar backend do formulário

### IMPORTANTE (Fazer na primeira semana):
4. 📸 Adicionar hero images reais
5. 📸 Adicionar fotos de cursos
6. 🎨 Converter favicons para PNG

### OPCIONAL (Pode fazer depois):
7. Fotos de depoimentos
8. Logos de parceiros
9. Analytics

**Boa sorte com o lançamento! 🚀**
