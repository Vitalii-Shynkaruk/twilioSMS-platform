# SCL SMS Platform

## Twilio SMS Platform for Secure Credit Lines (SCL Capital)

**Live URL:** https://app.sclcapital.io  
**Server:** DigitalOcean Ubuntu 24.04 (198.199.91.174)  
**Branch:** `deploy/mysql-hosting`

### Quick Start (Local Development)

```bash
# 1. Start MySQL & Redis
docker compose up -d

# 2. Install dependencies
cd server && npm install
cd ../client && npm install

# 3. Setup database
cd ../server
npx prisma generate
npx prisma db push
npx prisma db seed

# 4. Start dev servers (in separate terminals)
cd server && npm run dev    # → http://localhost:3001
cd client && npm run dev    # → http://localhost:5173
```

### Login

- **URL (production)**: https://app.sclcapital.io
- **URL (local)**: http://localhost:5173
- **Email**: admin@sclcapital.io
- **Password**: admin123

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
ssh root@198.199.91.174
cd /root/twilio-sms-platform
git pull origin deploy/mysql-hosting

# Build and restart
cd client && npm run build && cd ..
cd server && npm run build && cd ..
pm2 restart all
```

### Key Numbers

- 18 database models (Prisma)
- 13 API route groups
- 7 backend services
- 13 frontend pages
- 2 background workers (sending + automation)
