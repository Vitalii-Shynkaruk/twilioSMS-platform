# SCL SMS Platform

## Twilio SMS Platform for Secure Credit Lines

### Quick Start

```bash
# 1. Start PostgreSQL & Redis
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
cd server && npm run dev
cd client && npm run dev
```

### Login
- **URL**: http://localhost:5173
- **Email**: admin@securecreditlines.com
- **Password**: admin123

### Architecture
- **Backend**: Node.js + Express + TypeScript + Prisma + BullMQ
- **Frontend**: React 18 + Vite + TailwindCSS + Zustand
- **Database**: PostgreSQL 16
- **Queue**: Redis 7 + BullMQ
- **SMS**: Twilio Messaging Services

### Project Structure
```
server/
  prisma/          # Schema + seed
  src/
    config/        # DB, Redis, Twilio, Logger
    controllers/   # Route handlers
    middleware/     # Auth, error handling
    routes/        # Express routes
    services/      # Business logic
    jobs/          # BullMQ workers
    webhooks/      # Twilio callbacks
client/
  src/
    components/    # Shared UI components
    pages/         # Route pages
    services/      # API client
    stores/        # Zustand stores
    styles/        # Global CSS
    types/         # TypeScript interfaces
```
