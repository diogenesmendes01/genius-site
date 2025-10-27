# Corrigir Erros do Google Search Console

## O Problema

O Google Search Console está mostrando erros de recursos do **site ANTIGO** que estava no domínio antes:

❌ Fontes da wsimg.com (GoDaddy):
- gdsherpa-bold.woff2
- gdsherpa-regular.woff2
- montserrat da wsimg.com
- playfairdisplay da wsimg.com
- sourcesanspro da wsimg.com

❌ Imagens/Scripts antigos:
- videos/uA41GmyyG8IMaxXdb
- tccl-tti.min.js

## Por Que Está Acontecendo?

O Google ainda tem as **páginas antigas indexadas** no cache. O site atual do GENIUS não usa NENHUM desses recursos!

✅ Site atual usa:
- Cinzel (Google Fonts oficial)
- Montserrat (Google Fonts oficial)
- Logo GENIUS próprio
- Sem dependências da GoDaddy/wsimg.com

## Solução: Remover URLs Antigas do Google

### Passo 1: Forçar Re-Rastreamento das Páginas Atuais

1. Acesse o Google Search Console: https://search.google.com/search-console
2. Vá em **Inspeção de URL** (menu lateral)
3. Inspecione cada página:
   - https://geniusacademia.com/
   - https://geniusacademia.com/sobre-nos.html
   - https://geniusacademia.com/metodologia.html
4. Clique em **Solicitar indexação** para cada uma
5. Aguarde: O Google vai re-rastrear as páginas novas

### Passo 2: Remover URLs Antigas (Opcional)

Se você souber as URLs antigas específicas:

1. No Google Search Console, vá em **Remoções** (menu lateral)
2. Clique em **Nova solicitação**
3. Selecione **Remover temporariamente o URL**
4. Cole a URL antiga que está causando erro
5. Clique em **Próxima** → **Enviar solicitação**

Exemplo de URLs antigas para remover:
- URLs que não existem mais no site novo
- Páginas do template GoDaddy antigo

### Passo 3: Atualizar Sitemap

O sitemap já foi atualizado no commit anterior! ✅

Arquivo: `public/sitemap.xml` contém apenas as 3 páginas atuais:
- Homepage (/)
- Sobre Nosotros (/sobre-nos.html)
- Metodología (/metodologia.html)

### Passo 4: Verificar robots.txt

O robots.txt está correto! ✅

Arquivo: `public/robots.txt` aponta para o sitemap novo.

## Tempo de Resolução

- **Imediato**: Depois de solicitar re-indexação
- **Completo**: 1-4 semanas para o Google atualizar completamente o cache

## Como Verificar Se Resolveu

### Opção 1: Google Search Console
1. Vá em **Cobertura** ou **Páginas**
2. Verifique se as 3 páginas atuais estão indexadas sem erros
3. Os erros antigos vão desaparecer gradualmente

### Opção 2: Teste Manual
Busque no Google:
```
site:geniusacademia.com
```

Deve mostrar apenas as 3 páginas atuais sem referências antigas.

## Sobre os Favicons (assets/favicon)

Os favicons em `assets/favicon/` são os **antigos** com fundo branco.

✅ **Favicons atuais** (transparentes) estão em:
- `public/favicon.ico`
- `public/favicon-96x96.png`
- `public/apple-touch-icon.png`
- `public/android-icon-192x192.png`
- `public/android-icon-512x512.png`
- `public/favicon.svg`

❌ **Você pode deletar** a pasta `assets/favicon/` (não está sendo usada):
```bash
rm -rf "assets/favicon"
```

Ou manter como backup, mas ela não afeta o site.

## Resumo

✅ **Não há nada errado com o site atual!**
✅ **Os erros são do site antigo que estava no domínio**
✅ **Solução**: Solicitar re-indexação no Google Search Console
✅ **Tempo**: 1-4 semanas para limpar completamente

## Fontes Atuais do Site

O site GENIUS usa apenas:

```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

- ✅ Cinzel (títulos)
- ✅ Montserrat (corpo do texto)
- ✅ Carregadas do Google Fonts oficial
- ❌ Nenhuma fonte da wsimg.com/GoDaddy

Todos os recursos são próprios ou do Google Fonts. Não há dependências de sites externos desconhecidos! 🎉
