# 🚀 Backend NestJS - Guia Completo

## 📋 O que foi Implementado

### Arquitetura
- **Backend:** NestJS (TypeScript)
- **Frontend:** Servido estaticamente pelo NestJS
- **Email:** Nodemailer (Gmail)
- **Validação:** class-validator

### Estrutura do Projeto

```
genius-site/
├── src/                      # Backend NestJS
│   ├── main.ts              # Ponto de entrada
│   ├── app.module.ts        # Módulo principal
│   │
│   ├── leads/               # Módulo de Leads
│   │   ├── leads.module.ts
│   │   ├── leads.controller.ts
│   │   ├── leads.service.ts
│   │   └── dto/
│   │       └── create-lead.dto.ts
│   │
│   └── email/               # Módulo de Email
│       ├── email.module.ts
│       └── email.service.ts
│
├── public/                   # Frontend estático
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   └── assets/
│
├── .env                      # Variáveis de ambiente
├── tsconfig.json            # Config TypeScript
├── nest-cli.json            # Config NestJS
└── package.json             # Dependências
```

---

## 🚀 Como Rodar

### 1. Desenvolvimento (com hot-reload)
```bash
npm run dev
```

O servidor inicia em: **http://localhost:3000**
- 📄 Frontend: http://localhost:3000
- 🔌 API: http://localhost:3000/api
- 📬 Endpoint de leads: POST http://localhost:3000/api/leads

### 2. Build para Produção
```bash
npm run build
npm run start:prod
```

### 3. Parar o Servidor
Pressione `Ctrl + C` no terminal

---

## 📧 Configurar Email (Gmail)

### Modo Desenvolvimento (Atual)
- ✅ Já funciona!
- Emails são logados no console
- Não envia emails reais

### Modo Produção (Enviar Emails Reais)

1. **Criar App Password no Gmail:**
   - Acesse: https://myaccount.google.com/apppasswords
   - Login com sua conta Gmail
   - Crie uma senha de app para "Mail"
   - Copie a senha gerada (16 caracteres)

2. **Configurar .env:**
```bash
# Edite o arquivo .env
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx  # Senha de app (sem espaços)
```

3. **Reiniciar o servidor:**
```bash
# Ctrl + C para parar
npm run dev
```

4. **Verificar logs:**
```
✅ Email service configured successfully
```

---

## 🔌 API Endpoints

### POST /api/leads

Recebe dados do formulário de contato.

**Request:**
```json
{
  "name": "María González",
  "email": "maria@example.com",
  "phone": "+506-1234-5678",
  "course": "business",
  "country": "cr"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Lead recebido com sucesso!",
  "data": {
    "name": "María González",
    "email": "maria@example.com",
    "emailSent": true
  }
}
```

**Response (Error):**
```json
{
  "statusCode": 400,
  "message": ["Email inválido", "Nome é obrigatório"],
  "error": "Bad Request"
}
```

**Validações:**
- `name`: mínimo 2 caracteres
- `email`: formato válido
- `phone`: mínimo 8 dígitos
- `course`: "business" | "travel" | "exam" | "general"
- `country`: "cr" | "pa" | "sv" | "hn" | "ni" | "gt" | "bz"

---

## 🧪 Testar a API

### Opção 1: Pelo Site
1. Acesse: http://localhost:3000
2. Preencha o formulário
3. Clique em "Reservar Clase Gratis"
4. Veja os logs no terminal

### Opção 2: cURL
```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+506-1234-5678",
    "course": "business",
    "country": "cr"
  }'
```

### Opção 3: Postman/Insomnia
- Method: POST
- URL: http://localhost:3000/api/leads
- Headers: Content-Type: application/json
- Body: (JSON acima)

---

## 📊 Logs do Sistema

### Lead Recebido:
```
[LeadsController] 📬 POST /api/leads - Test User
[LeadsService] 📝 Novo lead recebido: Test User
[EmailService] 📧 Email (DEV MODE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para: contato@geniusacademia.com
Assunto: 🎓 Novo Lead: Test User - Costa Rica 🇨🇷
Nome: Test User
Email: test@example.com
Telefone: +506-1234-5678
Curso: Portugués para Negocios
País: Costa Rica 🇨🇷
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Email Configurado:
```
[EmailService] ✅ Email service configured successfully
[EmailService] ✅ Email enviado para contato@geniusacademia.com
```

---

## 🔧 Adicionar Banco de Dados (Opcional)

Se quiser salvar leads no banco:

### 1. Instalar TypeORM + PostgreSQL:
```bash
npm install @nestjs/typeorm typeorm pg
```

### 2. Criar entity `Lead`:
```typescript
// src/leads/entities/lead.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column()
  course: string;

  @Column()
  country: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

### 3. Configurar TypeORM no `app.module.ts`:
```typescript
TypeOrmModule.forRoot({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'genius_db',
  entities: [Lead],
  synchronize: true, // apenas em dev
}),
```

### 4. Atualizar `leads.service.ts`:
```typescript
constructor(
  @InjectRepository(Lead)
  private leadsRepository: Repository<Lead>,
  private readonly emailService: EmailService,
) {}

async create(createLeadDto: CreateLeadDto) {
  // Salvar no banco
  const lead = this.leadsRepository.create(createLeadDto);
  await this.leadsRepository.save(lead);

  // Enviar email
  await this.emailService.sendLeadNotification(createLeadDto);

  return { success: true, data: lead };
}
```

---

## 🚢 Deploy em Produção

### Opção 1: Heroku
```bash
# Criar Procfile
echo "web: npm run start:prod" > Procfile

# Deploy
heroku create genius-academia
git push heroku main
```

### Opção 2: Railway
```bash
railway login
railway init
railway up
```

### Opção 3: VPS (DigitalOcean, AWS, etc)
```bash
# Build
npm run build

# Transferir dist/ para servidor
scp -r dist/ user@server:/var/www/genius

# No servidor
cd /var/www/genius
npm install --production
npm run start:prod
```

### Configurar PM2 (Process Manager):
```bash
npm install -g pm2
pm2 start dist/main.js --name genius-api
pm2 save
pm2 startup
```

---

## 🔒 Variáveis de Ambiente (.env)

```bash
# Servidor
PORT=3000

# Email (Gmail)
EMAIL_USER=contato@geniusacademia.com
EMAIL_PASS=your-app-password-here

# Database (se usar)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=password
DB_NAME=genius_db

# Produção
NODE_ENV=production
```

⚠️ **Importante:** Adicione `.env` no `.gitignore` (já está!)

---

## 🐛 Troubleshooting

### Erro: "Cannot find module"
```bash
npm install
npm run build
```

### Erro: "Port 3000 already in use"
```bash
# Mudar porta no .env
PORT=3001
```

### Email não envia
1. Verifique se EMAIL_USER e EMAIL_PASS estão configurados
2. Use App Password do Gmail (não senha normal)
3. Verifique logs: `[EmailService]`

### Frontend não carrega
- Verifique se pasta `public/` existe
- Arquivos devem estar em `public/` não na raiz

---

## 📚 Recursos Adicionais

### Documentação:
- **NestJS:** https://docs.nestjs.com/
- **Nodemailer:** https://nodemailer.com/
- **TypeORM:** https://typeorm.io/

### Melhorias Futuras:
- [ ] Autenticação JWT
- [ ] Dashboard admin
- [ ] Webhooks para CRM
- [ ] Rate limiting
- [ ] Testes unitários
- [ ] Swagger/OpenAPI docs

---

## 🎉 Resumo

✅ Backend NestJS funcionando
✅ API `/api/leads` ativa
✅ Frontend servido estaticamente
✅ Email configurável (Gmail)
✅ Validação de dados
✅ CORS habilitado
✅ Hot reload em desenvolvimento
✅ Pronto para produção

**Tudo funcionando! 🚀**

---

**Última atualização:** Outubro 2025
**Versão:** 2.0.0 (Backend Integrado)
