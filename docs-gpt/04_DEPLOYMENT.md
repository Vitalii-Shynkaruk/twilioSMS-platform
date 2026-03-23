# Production Deployment Guide — SCL SMS Platform

> Last updated: March 2026

## Current Hosting: DigitalOcean Droplet

**Live URL**: https://app.sclcapital.io  
**Server IP**: 198.199.91.174  
**OS**: Ubuntu 24.04 LTS  
**Branch**: `deploy/mysql-hosting`

---

## Architecture

```
Internet → Nginx (SSL termination + static files + reverse proxy)
              ↓
         Express API (Node.js, port 3001, managed by PM2)
              ├── REST API (13 route groups)
              ├── WebSocket (Socket.IO — real-time inbox)
              ├── Twilio Webhooks (inbound SMS + delivery status)
              └── BullMQ Workers (2 workers: sending + automation)
              ↓
         MySQL 8.0 (local, port 3306)
         Redis (local, port 6379)
```

---

## Quick Deploy

```bash
# 1. SSH to server
ssh root@198.199.91.174
# Password: 7Securecreditlines

# 2. Pull latest code
cd /root/twilio-sms-platform
git pull origin deploy/mysql-hosting

# 3. Build frontend
cd client && npm run build && cd ..

# 4. Build backend
cd server && npm run build && cd ..

# 5. Restart services
pm2 restart all
```

**Or one-liner from local machine:**

```bash
sshpass -p '7Securecreditlines' ssh -o StrictHostKeyChecking=no root@198.199.91.174 \
  "cd /root/twilio-sms-platform && git pull origin deploy/mysql-hosting && cd client && npm run build && cd ../server && npm run build && cd .. && pm2 restart all"
```

---

## Server Layout

```
/root/twilio-sms-platform/        # Project root
  ├── client/                      # React frontend source
  │   └── dist/                    # Built static files (served by Nginx)
  ├── server/                      # Express backend source
  │   └── dist/                    # Compiled TypeScript
  ├── prisma/                      # Database schema
  └── docs/                        # Documentation

/etc/nginx/sites-available/        # Nginx configs
  └── app.sclcapital.io            # Main site config
```

---

## Services

### PM2 Process Manager

```bash
pm2 status              # Check all processes
pm2 restart all         # Restart everything
pm2 logs                # View all logs
pm2 logs sms-server     # View server logs only
pm2 monit               # Real-time monitoring
```

### MySQL 8.0

```bash
systemctl status mysql
mysql -u root -p        # Access MySQL CLI
```

### Redis

```bash
systemctl status redis
redis-cli ping          # Should return PONG
redis-cli info memory   # Check memory usage
```

### Nginx

```bash
systemctl status nginx
nginx -t                # Test config
systemctl reload nginx  # Apply config changes
```

---

## Nginx Configuration

The Nginx config serves:

- **Static files** from `/root/twilio-sms-platform/client/dist/`
- **API proxy** to `http://127.0.0.1:3001` for `/api/` and `/socket.io/` routes
- **SSL** via Let's Encrypt (auto-renewal via certbot)

```
server {
    listen 443 ssl;
    server_name app.sclcapital.io;

    ssl_certificate /etc/letsencrypt/live/app.sclcapital.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.sclcapital.io/privkey.pem;

    # Static frontend
    root /root/twilio-sms-platform/client/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Twilio Webhooks

Configure these in Twilio Console → Messaging Service → Integration:

| Webhook               | URL                                                      | Method |
| --------------------- | -------------------------------------------------------- | ------ |
| **Incoming Messages** | `https://app.sclcapital.io/api/webhooks/twilio/incoming` | POST   |
| **Status Callback**   | `https://app.sclcapital.io/api/webhooks/twilio/status`   | POST   |

---

## Environment Variables

Key environment variables in `/root/twilio-sms-platform/server/.env`:

| Variable                        | Description                               |
| ------------------------------- | ----------------------------------------- |
| `DATABASE_URL`                  | MySQL connection string                   |
| `REDIS_URL`                     | Redis connection (redis://localhost:6379) |
| `TWILIO_ACCOUNT_SID`            | Twilio Account SID                        |
| `TWILIO_AUTH_TOKEN`             | Twilio Auth Token                         |
| `TWILIO_MESSAGING_SERVICE_SID`  | Messaging Service SID                     |
| `JWT_SECRET`                    | JWT signing key                           |
| `SMS_MODE`                      | `live` / `twilio_test` / `simulation`     |
| `WEBHOOK_BASE_URL`              | `https://app.sclcapital.io`               |
| `MAX_MESSAGES_PER_MINUTE`       | Global rate limit (default: 300)          |
| `MAX_DAILY_MESSAGES_PER_NUMBER` | Per-number daily cap (default: 350)       |
| `RAMP_UP_ENABLED`               | Enable warm-up system (true/false)        |

---

## SSL Certificate Renewal

Let's Encrypt certificates auto-renew via certbot timer:

```bash
certbot renew --dry-run    # Test renewal
certbot certificates       # Check current certs
```

---

## Database Management

### Prisma Migrations

```bash
cd /root/twilio-sms-platform/server
npx prisma db push         # Push schema changes
npx prisma generate        # Regenerate client
npx prisma studio          # Open DB browser (dev only)
```

### Backup

```bash
# Create backup
mysqldump -u root -p sms_platform > /root/backups/sms_$(date +%Y%m%d).sql

# Restore backup
mysql -u root -p sms_platform < /root/backups/sms_20260318.sql
```

---

## Troubleshooting

| Problem              | Solution                                                             |
| -------------------- | -------------------------------------------------------------------- |
| Site down / 502      | `pm2 restart all` then check `pm2 logs`                              |
| API not responding   | `curl http://localhost:3001/api/health` — if fails, check PM2        |
| SSL expired          | `certbot renew && systemctl reload nginx`                            |
| Redis down           | `systemctl restart redis`                                            |
| MySQL down           | `systemctl restart mysql`                                            |
| High memory          | `pm2 monit` — check for memory leaks; `pm2 restart all`              |
| Build fails          | Check Node.js version: `node -v` (should be 18+)                     |
| Webhook 404          | Verify URL in Twilio Console matches `/api/webhooks/twilio/incoming` |
| Messages not sending | Check SMS_MODE in .env (must be `live`), check Twilio balance        |
| Numbers in COOLING   | Wait 24h for auto-recovery, or manually activate in app              |

---

## Health Check

```bash
# API health
curl -s https://app.sclcapital.io/api/health

# Expected response:
# {"status":"ok"}
```
