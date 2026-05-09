# SCL SMS Platform

## Twilio SMS Platform for Secure Credit Lines (SCL Capital)

**Live URL:** https://app.sclcapital.io  
**Hosting:** DigitalOcean Ubuntu 24.04, Nginx, PM2  
**Production branch:** `main`

### Quick Start (Local Development)

```bash
# 1. Start MySQL and Redis
docker compose up -d

# 2. Install dependencies
npm install
npm --prefix server install
npm --prefix client install

# 3. Setup database
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate
npm --prefix server run prisma:seed

# 4. Start dev servers (in separate terminals)
npm run dev:server    # http://localhost:3001
npm run dev:client    # http://localhost:5173
```

### Login

- **URL (production)**: https://app.sclcapital.io
- **URL (local)**: http://localhost:5173
  Use the admin account configured in the server environment variables. Never commit production passwords to GitHub.

### Architecture

- **Backend**: Node.js + Express + TypeScript + Prisma ORM + BullMQ
- **Frontend**: React 18 + Vite 6 + TailwindCSS + Zustand + @tanstack/react-query
- **Database**: MySQL 8.0
- **Queue**: Redis + BullMQ (job processing)
- **Real-time**: Socket.IO (live inbox updates)
- **SMS**: Twilio (Messaging Service + A2P 10DLC)
- **Hosting**: DigitalOcean, Nginx, PM2, Let's Encrypt SSL

### Project Structure

```
server/
  prisma/          # Schema + seed
  src/
    config/        # DB, Redis, Twilio, Logger
    controllers/   # Route handlers (8 controllers)
    middleware/     # Auth, error handling, validation
    routes/        # Express routes (13 route groups)
    services/      # Business logic (7 services)
    jobs/          # BullMQ workers (sending + automation)
    webhooks/      # Twilio callbacks (inbound + status)
    validation/    # Zod schemas
client/
  src/
    components/    # Shared UI components
    pages/         # Route pages (13 pages)
    services/      # API client
    stores/        # Zustand stores
    styles/        # Global CSS + SCL theme tokens
    types/         # TypeScript interfaces
```

### Production Deploy

```bash
# SSH to server and pull latest
ssh root@your-server-ip
cd /opt/sms-platform
git pull origin main

# Build and restart
npm --prefix server run prisma:migrate:prod
npm --prefix server run build
npm --prefix client run build
pm2 restart sms-api --update-env
curl -f http://127.0.0.1:3001/api/health
```

See [SERVER_INSTALLATION.md](SERVER_INSTALLATION.md) for full server setup, multi-instance deployment, and GitHub-as-source-of-truth workflow.

### Key Numbers

- 18 database models (Prisma)
- 13 API route groups
- 7 backend services
- 13 frontend pages
- 2 background workers (sending + automation)
