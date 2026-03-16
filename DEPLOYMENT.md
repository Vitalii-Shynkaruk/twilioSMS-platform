# 🚀 Production Deployment Guide — SCL SMS Platform

## Prerequisites

- **Server**: Ubuntu 22.04+ (or similar) with 2+ CPU, 4+ GB RAM
- **Domain**: DNS A record pointing to your server IP
- **Docker & Docker Compose** installed
- **Git** installed

---

## 1. Server Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose (v2)
sudo apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## 2. Clone & Configure

```bash
# Clone repository
git clone https://github.com/ksanyok/twilio-sms-platform.git
cd twilio-sms-platform

# Create production .env from template
cp .env.production.example .env

# Generate strong secrets
echo "JWT_SECRET=$(openssl rand -base64 48)" 
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 16)"
```

Edit `.env` and set ALL values:
- Replace `yourdomain.com` with your actual domain
- Paste generated secrets from above
- Set Twilio live credentials
- Set admin email and password

---

## 3. SSL Certificates (Let's Encrypt)

### Option A: Certbot standalone (before Docker)

```bash
# Install certbot
sudo apt install certbot -y

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Copy certs to project
mkdir -p ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/
sudo chmod 644 ssl/*.pem
```

### Option B: Self-signed (for testing only)

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/privkey.pem \
  -out ssl/fullchain.pem \
  -subj "/CN=yourdomain.com"
```

### Auto-renewal (add to crontab)

```bash
# Add to crontab: sudo crontab -e
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/yourdomain.com/*.pem /path/to/project/ssl/ && docker compose restart nginx
```

---

## 4. Build & Deploy

```bash
# Build and start all services
docker compose up -d --build

# Check all services are running
docker compose ps

# View logs
docker compose logs -f app
docker compose logs -f nginx

# Run database migrations
docker compose exec app npx prisma migrate deploy

# Seed initial admin user
docker compose exec app npx prisma db seed
```

---

## 5. Verify Deployment

```bash
# Health check
curl -k https://yourdomain.com/api/health

# Expected response:
# {"status":"ok","timestamp":"...","uptime":...}

# Check HTTPS headers
curl -I https://yourdomain.com

# Should include:
# Strict-Transport-Security: max-age=63072000
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
```

---

## 6. Set Twilio Webhooks

In Twilio Console, for each phone number:

- **Incoming Message Webhook**: `https://yourdomain.com/api/webhooks/twilio/incoming`
- **Status Callback**: `https://yourdomain.com/api/webhooks/twilio/status`
- **Method**: `POST`

---

## 7. Firewall Setup

```bash
# Allow only HTTP, HTTPS and SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# PostgreSQL (5432) and Redis (6379) are NOT exposed — Docker internal only
```

---

## 8. Monitoring & Maintenance

### View logs
```bash
docker compose logs -f           # all services
docker compose logs -f app       # backend only
docker compose logs -f nginx     # nginx only
```

### Restart services
```bash
docker compose restart app       # restart backend
docker compose restart           # restart all
```

### Update deployment
```bash
git pull origin main
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

### Database backup
```bash
# Create backup
docker compose exec postgres pg_dump -U scl scl_sms > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
cat backup_file.sql | docker compose exec -T postgres psql -U scl scl_sms
```

### Redis backup
```bash
docker compose exec redis redis-cli -a $REDIS_PASSWORD BGSAVE
```

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| App won't start | Check `docker compose logs app` — likely missing env vars |
| "JWT_SECRET is not set" | Set JWT_SECRET and JWT_REFRESH_SECRET in `.env` |
| 502 Bad Gateway | App hasn't started yet — wait or check logs |
| SSL errors | Verify ssl/ directory has `fullchain.pem` and `privkey.pem` |
| Redis connection refused | Check REDIS_PASSWORD matches in `.env` |
| Database connection error | Verify POSTGRES_PASSWORD matches and postgres container is healthy |

---

## 10. Security Checklist

- [ ] `.env` file has strong, unique passwords and secrets
- [ ] SSL certificates installed and auto-renewal configured
- [ ] Firewall only allows ports 22, 80, 443
- [ ] Admin password changed from default
- [ ] Twilio webhooks point to HTTPS URL
- [ ] SMS_MODE set to `live` (not `simulation`)
- [ ] Database backups scheduled
- [ ] Server SSH key-only auth (disable password login)

---

## Architecture

```
Internet → Nginx (80/443) → Express App (3001) → PostgreSQL / Redis
                ↓
         Static Files (React SPA)
```

- **Nginx**: SSL termination, reverse proxy, static files, rate limiting
- **App**: Node.js/Express API + Socket.IO
- **PostgreSQL**: Primary database (Prisma ORM)
- **Redis**: BullMQ job queues, caching
