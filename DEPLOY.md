# Deploy no Coolify

Este guia explica como fazer deploy da aplicação GENIUS Academia no Coolify.

## Pré-requisitos

- Repositório Git configurado (GitHub, GitLab, etc.)
- Conta no Coolify
- Variáveis de ambiente configuradas

## Passo 1: Preparar o Repositório

Certifique-se de que todos os arquivos estão commitados:

```bash
git add .
git commit -m "Prepare for Coolify deployment"
git push origin main
```

## Passo 2: Criar Aplicação no Coolify

1. Acesse seu painel do Coolify
2. Clique em **"New Resource"**
3. Selecione **"Application"**
4. Escolha seu repositório Git
5. Configure:
   - **Branch**: `main`
   - **Build Pack**: Docker (detectará automaticamente o Dockerfile)
   - **Port**: `3000`

## Passo 3: Configurar Variáveis de Ambiente

No painel do Coolify, adicione as seguintes variáveis de ambiente:

### Obrigatórias:
```env
PORT=3000
NODE_ENV=production
```

### Para Email (Opcional - se não configurar, emails serão logados no console):
```env
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-de-app-do-gmail
```

**Como obter a senha de app do Gmail:**
1. Acesse: https://myaccount.google.com/apppasswords
2. Crie uma "App Password" para esta aplicação
3. Use essa senha (não a senha normal do Gmail)

## Passo 4: Deploy

1. Clique em **"Deploy"**
2. Aguarde o build (pode levar 2-5 minutos)
3. Seu site estará disponível no domínio fornecido pelo Coolify

## Estrutura do Projeto

- **Backend**: NestJS (Node.js)
- **Frontend**: HTML/CSS/JS (servido estaticamente)
- **Porta**: 3000
- **API**: `/api/leads` (POST)

## Recursos da Aplicação

### Endpoints:
- `GET /` - Landing page
- `POST /api/leads` - Envio de formulário de contato
- `GET /api/health` - Health check

### Arquivos Estáticos:
- HTML: `/public/index.html`
- CSS: `/public/styles.css`
- JS: `/public/script.js`
- Assets: `/public/assets/`

## Solução de Problemas

### Build Falhou
- Verifique se o `Dockerfile` está no root do projeto
- Confirme que o `.dockerignore` está configurado
- Verifique os logs de build no Coolify

### Aplicação não responde
- Verifique se a porta 3000 está exposta
- Confirme que o host está configurado como `0.0.0.0`
- Verifique os logs da aplicação

### Emails não enviam
- Verifique se `EMAIL_USER` e `EMAIL_PASS` estão configurados
- Confirme que a senha de app do Gmail está correta
- Se não configurar, emails serão logados no console (modo desenvolvimento)

## Domínio Customizado

Para usar um domínio próprio:
1. No Coolify, vá em **"Domains"**
2. Adicione seu domínio
3. Configure o DNS apontando para o IP do Coolify
4. Aguarde a propagação DNS (pode levar até 48h)

## Monitoramento

O Coolify fornece:
- Logs em tempo real
- Métricas de uso (CPU, RAM)
- Health checks automáticos
- Restart automático em caso de falha

## Atualizações

Para atualizar a aplicação:
1. Faça commit das mudanças no Git
2. Push para o branch `main`
3. No Coolify, clique em **"Redeploy"**

## Suporte

Para problemas relacionados ao deploy, consulte:
- Documentação do Coolify: https://coolify.io/docs
- Documentação do NestJS: https://docs.nestjs.com
