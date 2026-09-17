# GENIUS Academia de Lenguas - Landing Page

## Landing atual — setembro de 2026

A home e as páginas `metodologia.html` e `sobre-nos.html` usam o novo visual navy, cream e dourado, com Cormorant Garamond e Manrope. Os arquivos publicados estão em `public/`; o contato da landing é feito pelo WhatsApp, e o Instagram é `@geniusacademiadelenguas`.

Consulte [a documentação da landing atual](docs/landing-page.md) para estrutura, prévia local, recursos e validação, e [o guia de SEO e descoberta por assistentes](docs/search-discovery.md) para a página do curso, indexação e acompanhamento no Search Console. As seções seguintes deste README descrevem a versão anterior do site.

![GENIUS Academia](https://img.shields.io/badge/GENIUS-Academia%20de%20Lenguas-0EA5E9?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production%20Ready-10B981?style=for-the-badge)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

Landing page premium para captação de leads da **GENIUS - Academia de Lenguas**, especializada em ensino de português brasileiro em 7 países da América Central.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Demo](#-demo)
- [Instalación](#-instalación)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Identidad Visual](#-identidad-visual)
- [Personalización](#-personalización)
- [Assets Pendientes](#-assets-pendientes)
- [Optimización](#-optimización)
- [Deployment](#-deployment)
- [Soporte de Navegadores](#-soporte-de-navegadores)
- [Licencia](#-licencia)

---

## ✨ Características

### Funcionalidades Implementadas

- ✅ **Diseño Responsivo** - Optimizado para móvil, tablet y desktop
- ✅ **Selector de País** - 7 países de América Central con contenido localizado
- ✅ **Animaciones Suaves** - Scroll animations y transitions
- ✅ **Formulario de Contacto** - Con validación frontend
- ✅ **SEO Optimizado** - Meta tags, estructura semántica
- ✅ **Performance** - CSS optimizado, lazy loading preparado
- ✅ **Accesibilidad** - ARIA labels, navegación por teclado
- ✅ **Multi-idioma ready** - Estructura preparada para ES/EN

### Secciones de la Página

1. **Header** - Logo, selector de país, CTA
2. **Hero** - Headline principal, CTAs, estadísticas
3. **Proof Bar** - Logos de certificaciones y partners
4. **Metodología** - 4 pilares del método GENIUS
5. **Cursos** - 3 tipos de cursos disponibles
6. **Testimonios** - 3 depoimentos de alumnos
7. **CTA/Contacto** - Formulario de registro
8. **Footer** - Links, redes sociales, información legal

---

## 🚀 Demo

### Vista Previa Local

Para ver el sitio localmente:

```bash
# Opción 1: Python Simple HTTP Server
python3 -m http.server 8000

# Opción 2: Node.js http-server
npx http-server -p 8000

# Opción 3: PHP Built-in Server
php -S localhost:8000

# Luego abre: http://localhost:8000
```

### Screenshots

_(Agregar screenshots cuando estén las imágenes reales)_

---

## 🔧 Instalación

### Requisitos Previos

- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Editor de código (VS Code recomendado)
- Servidor web local (para desarrollo)

### Pasos de Instalación

1. **Clonar o descargar el proyecto**

```bash
git clone https://github.com/tu-usuario/genius-site.git
cd genius-site
```

2. **Abrir con Live Server**

Si usas VS Code:
- Instala la extensión "Live Server"
- Click derecho en `index.html` > "Open with Live Server"

3. **Personalizar contenido**

Edita los archivos según tus necesidades:
- `index.html` - Estructura y contenido
- `styles.css` - Estilos y colores
- `script.js` - Funcionalidades interactivas

---

## 📁 Estructura del Proyecto

```
genius-site/
│
├── index.html              # Página principal
├── styles.css              # Estilos globales
├── script.js               # JavaScript interactivo
├── README.md               # Este archivo
├── DESIGN_BRIEF_ESCOLA_PORTUGUES.md  # Brief de diseño
│
├── assets/                 # Todos los recursos
│   ├── images/            # Fotos (hero, cursos, etc)
│   │   ├── hero-cr.webp   # Hero Costa Rica
│   │   ├── hero-pa.webp   # Hero Panamá
│   │   ├── hero-sv.webp   # Hero El Salvador
│   │   └── ...            # (pendiente)
│   │
│   ├── badges/            # Badges y sellos
│   │   ├── badge-rating.svg      ✅ Creado
│   │   ├── badge-students.svg    ✅ Creado
│   │   └── badge-award.svg       ✅ Creado
│   │
│   ├── icons/             # Iconos de metodología (pendiente)
│   │   ├── icon-immersion.svg
│   │   ├── icon-practice.svg
│   │   ├── icon-feedback.svg
│   │   └── icon-certification.svg
│   │
│   ├── logos/             # Logos de partners (pendiente)
│   │   ├── logo-horizontal-color.svg
│   │   ├── logo-horizontal-white.svg
│   │   └── ...
│   │
│   └── favicon/           # Favicons
│       ├── favicon.svg           ✅ Creado
│       ├── favicon-16x16.png     (pendiente)
│       ├── favicon-32x32.png     (pendiente)
│       └── apple-touch-icon.png  (pendiente)
│
└── docs/                  # Documentación adicional
    └── ...
```

---

## 🎨 Identidad Visual

### Paleta de Colores

#### Colores Principales

```css
/* Azul Primario */
#0EA5E9  /* RGB: 14, 165, 233 */

/* Azul Oscuro */
#0369A1  /* RGB: 3, 105, 161 */
```

#### Colores Accent

```css
/* Naranja Energético */
#F97316  /* RGB: 249, 115, 22 */

/* Verde Éxito */
#10B981  /* RGB: 16, 185, 129 */
```

#### Colores Neutros

```css
/* Texto Principal */
#111827  /* RGB: 17, 24, 39 */

/* Texto Secundario */
#6B7280  /* RGB: 107, 114, 128 */

/* Bordes */
#E5E7EB  /* RGB: 229, 231, 235 */

/* Background */
#F9FAFB  /* RGB: 249, 250, 251 */
```

### Tipografía

**Fuente Principal:** Inter (Google Fonts)

**Pesos utilizados:**
- Regular (400) - Texto corpo
- Medium (500) - Subtítulos
- SemiBold (600) - Botones
- Bold (700) - Títulos
- ExtraBold (800) - Headlines

**Tamaños (Desktop):**
- Hero Headline: 64px (4rem)
- Section Title: 48px (3rem)
- H2: 30px (1.875rem)
- H3: 24px (1.5rem)
- Body: 16px (1rem)
- Small: 14px (0.875rem)

---

## ⚙️ Personalización

### Cambiar Colores

Edita las variables CSS en `styles.css`:

```css
:root {
  --color-primary-blue: #0EA5E9;
  --color-accent-orange: #F97316;
  /* ... */
}
```

### Agregar Nuevo País

1. En `index.html`, agrega opción en el dropdown:

```html
<button class="country-option" data-country="xx" data-flag="🏴" data-name="País">
  <span class="country-flag">🏴</span> Nombre País
</button>
```

2. En `script.js`, agrega datos del país:

```javascript
const countryContent = {
  xx: {
    phone: '+xxx-xxxx-xxxx',
    whatsapp: 'https://wa.me/xxxxxxxxxxx'
  }
};
```

### Conectar Formulario

Reemplaza el código de envío en `script.js`:

```javascript
// Línea ~180 en script.js
// Reemplaza la simulación con tu endpoint real

const response = await fetch('https://tu-api.com/leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### Integrar Analytics

Agrega Google Analytics antes del `</head>`:

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

---

## 📸 Assets Pendientes

### Prioridad Alta

#### Hero Images (7 unidades)
- [ ] `hero-cr.webp` - Costa Rica (1920×1080)
- [ ] `hero-pa.webp` - Panamá
- [ ] `hero-sv.webp` - El Salvador
- [ ] `hero-hn.webp` - Honduras
- [ ] `hero-ni.webp` - Nicaragua
- [ ] `hero-gt.webp` - Guatemala
- [ ] `hero-bz.webp` - Belize

#### Fotos de Cursos (3 unidades)
- [ ] `course-business.webp` - Portugués Negocios (800×600)
- [ ] `course-travel.webp` - Portugués Viajes
- [ ] `course-exam.webp` - Preparación Exámenes

#### Logos e Identidad
- [ ] Logo horizontal (color + blanco) - SVG
- [ ] Logo vertical - SVG
- [ ] Ícono/símbolo - SVG
- [ ] Favicons PNG (16×16, 32×32, 180×180, 192×192, 512×512)

### Prioridad Media

#### Fotos de Testimonios (6 unidades)
- [ ] 6 retratos de "alumnos" (400×400, circulares)

#### Ícones de Metodología (4 unidades)
- [ ] `icon-immersion.svg`
- [ ] `icon-practice.svg`
- [ ] `icon-feedback.svg`
- [ ] `icon-certification.svg`

#### Logos Parceiros (6-8 unidades)
- [ ] Celpe-Bras oficial
- [ ] DIPLE
- [ ] Otros certificados/partners

### Prioridad Baja

#### Social Media
- [ ] OG Image (1200×630) para compartir en redes

#### Video (Opcional)
- [ ] Video explicativo metodología (MP4, 60-120s)

### Dónde Obtener Imágenes

**Gratuitas:**
- [Unsplash](https://unsplash.com) - Buscar "education", "diversity", "students"
- [Pexels](https://pexels.com) - Fotos de alta calidad
- [Pixabay](https://pixabay.com) - Libre de derechos

**Pagas:**
- [iStock](https://istockphoto.com)
- [Shutterstock](https://shutterstock.com)
- [Adobe Stock](https://stock.adobe.com)

**Recomendación:** Contratar sesión fotográfica profesional para autenticidad.

---

## ⚡ Optimización

### Performance

#### Imágenes

```bash
# Optimizar con TinyPNG CLI
npm install -g tinypng-cli
tinypng assets/images/*.{jpg,png} -k YOUR_API_KEY

# O usar Squoosh (online)
# https://squoosh.app
```

#### CSS & JS

```bash
# Minificar CSS
npx csso styles.css --output styles.min.css

# Minificar JS
npx terser script.js --output script.min.js --compress --mangle
```

#### Lazy Loading de Imágenes

Agregar `loading="lazy"` a las imágenes:

```html
<img src="course-business.webp" alt="..." loading="lazy">
```

### SEO

#### Meta Tags Completos

Ya implementados en `index.html`:
- Title tag
- Meta description
- Open Graph tags
- Twitter cards
- Canonical URL

#### Sitemap.xml

Crear `sitemap.xml` en la raíz:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://geniusacademia.com/</loc>
    <lastmod>2025-10-24</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

#### robots.txt

Crear `robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://geniusacademia.com/sitemap.xml
```

---

## 🚢 Deployment

### Opción 1: Netlify (Recomendado)

```bash
# 1. Instalar Netlify CLI
npm install -g netlify-cli

# 2. Login
netlify login

# 3. Deploy
netlify deploy --prod
```

### Opción 2: Vercel

```bash
# 1. Instalar Vercel CLI
npm install -g vercel

# 2. Deploy
vercel --prod
```

### Opción 3: GitHub Pages

1. Subir código a GitHub
2. Settings > Pages
3. Source: main branch / root
4. Deploy

### Opción 4: Hosting Tradicional (cPanel)

1. Comprimir proyecto en .zip
2. Subir via FTP o File Manager
3. Extraer en public_html/
4. Listo

---

## 🌐 Soporte de Navegadores

### Desktop
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Mobile
- ✅ iOS Safari 14+
- ✅ Chrome Android 90+
- ✅ Samsung Internet 14+

### Notas
- CSS Grid & Flexbox (IE11 no soportado)
- CSS Variables (IE no soportado)
- Intersection Observer API (polyfill disponible)

---

## 📊 Checklist de Lanzamiento

### Pre-Lanzamiento

- [ ] Todas las imágenes optimizadas (<250KB cada)
- [ ] Logos de partners agregados
- [ ] Números de WhatsApp actualizados por país
- [ ] Formulario conectado a backend/CRM
- [ ] Google Analytics instalado
- [ ] Meta tags verificados
- [ ] Favicon funcionando
- [ ] OG Image creada y testeada
- [ ] SSL certificado instalado (HTTPS)
- [ ] Testear en móviles reales
- [ ] Validar HTML (validator.w3.org)
- [ ] Lighthouse score > 90

### Post-Lanzamiento

- [ ] Monitorear conversiones del formulario
- [ ] Configurar alertas de error
- [ ] A/B testing de CTAs
- [ ] Heatmaps (Hotjar/Clarity)
- [ ] Backups automáticos
- [ ] Actualizar contenido mensualmente

---

## 🛠️ Tecnologías Utilizadas

- **HTML5** - Estructura semántica
- **CSS3** - Variables, Grid, Flexbox, Animaciones
- **JavaScript (Vanilla)** - Sin dependencias
- **Google Fonts** - Inter
- **SVG** - Iconos y gráficos vectoriales

---

## 📝 Próximos Pasos

### Fase 1: Contenido (Semana 1-2)
1. Contratar fotógrafo para sesión
2. Crear logo definitivo
3. Obtener logos de partners
4. Escribir copy final

### Fase 2: Integraciones (Semana 3)
1. Conectar formulario a CRM (HubSpot/Salesforce)
2. Integrar WhatsApp Business API
3. Configurar email marketing (Mailchimp)
4. Instalar Facebook Pixel

### Fase 3: Optimización (Semana 4)
1. A/B testing de headlines
2. Optimizar velocidad de carga
3. Implementar chatbot
4. Crear páginas de agradecimiento

### Fase 4: Marketing (Ongoing)
1. Campaigns de Google Ads
2. Facebook/Instagram Ads
3. SEO local por país
4. Content marketing (blog)

---

## 🤝 Contribuir

Si deseas contribuir al proyecto:

1. Fork el repositorio
2. Crea una branch (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la branch (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📞 Soporte y Contacto

**Desarrollador:** [Tu Nombre]
**Email:** desarrollo@geniusacademia.com
**Website:** https://geniusacademia.com

### Reportar Bugs

Abre un issue en GitHub con:
- Descripción del problema
- Pasos para reproducir
- Screenshots si aplica
- Navegador y versión

---

## 📄 Licencia

© 2025 GENIUS Academia de Lenguas. Todos los derechos reservados.

Este proyecto es propietario y confidencial. No está permitida su distribución o modificación sin autorización explícita.

---

## 🙏 Agradecimientos

- **Design Brief:** Basado en especificaciones detalladas del cliente
- **Inspiración:** Red Balloon, CCAA, Influx
- **Fonts:** Google Fonts (Inter)
- **Icons:** SVG customizados

---

## 📚 Recursos Adicionales

### Documentación
- [Design Brief Completo](DESIGN_BRIEF_ESCOLA_PORTUGUES.md)
- [MDN Web Docs](https://developer.mozilla.org)
- [Can I Use](https://caniuse.com)

### Herramientas
- [Figma](https://figma.com) - Diseño
- [TinyPNG](https://tinypng.com) - Optimización imágenes
- [Google PageSpeed](https://pagespeed.web.dev) - Performance
- [GTmetrix](https://gtmetrix.com) - Análisis velocidad

---

**Última actualización:** Octubre 2025
**Versión:** 1.0.0
**Status:** ✅ Production Ready (pendiente assets finales)

---

¿Preguntas? ¿Sugerencias? [Contáctanos](#-soporte-y-contacto)
