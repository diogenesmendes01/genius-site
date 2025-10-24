# 🚀 Guia Rápido de Desenvolvimento

## Iniciar o Projeto

### Opção 1: Desenvolvimento com Live Reload (Recomendado)
```bash
npm run dev
```
- ✅ Abre automaticamente no navegador
- ✅ Live reload ativado (atualiza ao salvar arquivos)
- ✅ Porta: 8000
- 🌐 URL: http://localhost:8000

### Opção 2: Servidor Simples
```bash
npm start
```
- Servidor sem live reload
- Porta: 8000

### Opção 3: HTTP Server
```bash
npm run serve
```
- Alternativa com http-server
- Porta: 8000

### Opção 4: Python (Sem Node.js)
```bash
python -m http.server 8000
```
- Não precisa do Node.js
- Sem live reload

## Estrutura de Arquivos

```
genius-site/
├── index.html          # ✏️ Editar conteúdo aqui
├── styles.css          # 🎨 Editar estilos aqui
├── script.js           # ⚡ Editar JavaScript aqui
├── package.json        # 📦 Configuração npm
└── assets/             # 🖼️ Imagens e recursos
```

## Tarefas Comuns

### 1. Atualizar Números de WhatsApp

Edite `script.js` (linhas 82-111):

```javascript
const countryContent = {
  cr: {
    phone: '+506-1234-5678',
    whatsapp: 'https://wa.me/50612345678'
  },
  // ... outros países
};
```

### 2. Mudar Cores

Edite `styles.css` (linhas 9-29):

```css
:root {
  --color-primary-blue: #0EA5E9;
  --color-accent-orange: #F97316;
  /* ... outras variáveis */
}
```

### 3. Adicionar Imagem Hero

1. Salve a imagem em `assets/images/hero-cr.webp`
2. Edite `script.js` (função `updateHeroImage`)

### 4. Conectar Formulário

Edite `script.js` (linha ~179):

```javascript
// Substitua a simulação pela sua API
const response = await fetch('https://sua-api.com/leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

## Debug e Testes

### Ver Console do Navegador
1. Abra o site (http://localhost:8000)
2. Pressione `F12` ou `Ctrl + Shift + I`
3. Vá para a aba "Console"

### Testar Responsividade
1. Pressione `F12`
2. Clique no ícone de dispositivo móvel
3. Teste diferentes tamanhos de tela

### Validar HTML
- Acesse: https://validator.w3.org/
- Cole a URL: http://localhost:8000

### Testar Performance
- Acesse: https://pagespeed.web.dev/
- Digite a URL do site em produção

## Problemas Comuns

### ❌ Erro: "Cannot GET /"
**Solução:** Certifique-se que está na pasta correta
```bash
cd "C:\Users\PC Di\Desktop\CODIGO\genius-site"
npm run dev
```

### ❌ Erro: "Port 8000 already in use"
**Solução 1:** Pare o servidor anterior (Ctrl + C)

**Solução 2:** Use outra porta
```bash
npx live-server --port=8080
```

### ❌ Imagens não aparecem
**Solução:** Verifique os caminhos
- Certo: `/assets/images/hero-cr.webp`
- Errado: `assets/images/hero-cr.webp` (sem barra inicial)

### ❌ JavaScript não funciona
**Solução:** Abra o Console (F12) e veja os erros

### ❌ Estilos não aplicam
**Solução:**
1. Limpe o cache (Ctrl + Shift + R)
2. Verifique o caminho do CSS no HTML

## Atalhos Úteis

### No Editor (VS Code)
- `Ctrl + S` - Salvar
- `Alt + Shift + F` - Formatar código
- `Ctrl + /` - Comentar/descomentar
- `Ctrl + D` - Selecionar próxima ocorrência
- `F5` - Debug

### No Navegador
- `F12` - DevTools
- `Ctrl + Shift + R` - Recarregar sem cache
- `Ctrl + Shift + C` - Inspecionar elemento
- `Ctrl + U` - Ver código-fonte

## Workflow de Desenvolvimento

1. **Inicie o servidor:**
   ```bash
   npm run dev
   ```

2. **Faça suas alterações:**
   - Edite HTML, CSS ou JS
   - Salve o arquivo (Ctrl + S)
   - O navegador atualiza automaticamente

3. **Teste:**
   - Verifique no navegador
   - Teste em mobile (F12 > Device toolbar)
   - Veja o console por erros

4. **Commit (Git):**
   ```bash
   git add .
   git commit -m "Descrição das mudanças"
   git push
   ```

## Próximos Passos

Consulte `NEXT_STEPS.md` para:
- Assets pendentes
- Configurações obrigatórias
- Deploy do site

## Suporte

- 📖 Documentação completa: `README.md`
- 📝 Próximas tarefas: `NEXT_STEPS.md`
- 🎨 Design system: `DESIGN_BRIEF_ESCOLA_PORTUGUES.md`

---

**Dica:** Mantenha o terminal aberto enquanto desenvolve para ver logs e erros em tempo real!

**Última atualização:** Outubro 2025
