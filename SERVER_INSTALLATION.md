# Server Installation and Deployment Guide

This guide describes how to deploy the SCL SMS Platform on a new DigitalOcean Ubuntu server and how to keep multiple single-tenant instances updated from the same GitHub repository.

## Architecture

- One GitHub repository contains the application source code.
- Each customer or team instance runs on its own droplet.
- Each droplet has its own database, Redis instance, Twilio credentials, JWT secrets, and domain.
- The application is single-tenant per droplet. No multi-tenant backend refactor is required for separate teams.

Important: the current Prisma schema uses MySQL. Do not provision PostgreSQL unless the code is migrated first.

## Server Requirements

- Ubuntu 24.04 LTS
- Node.js 20 LTS
- MySQL 8
- Redis 7
- Nginx
- PM2
- Git
- A domain pointed to the droplet IP address
- Twilio Messaging Service with approved A2P 10DLC registration

## 1. Create the Server User and Install Packages

```bash
apt update
apt install -y git curl nginx mysql-server redis-server build-essential

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

npm install -g pm2
```

## 2. Create the MySQL Database

```bash
mysql
```

```sql
CREATE DATABASE scl_sms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'scl'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON scl_sms.* TO 'scl'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

The application database URL will use this format:

```bash
DATABASE_URL="mysql://scl:REPLACE_WITH_STRONG_PASSWORD@localhost:3306/scl_sms"
```

## 3. Clone the Repository

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/Vitalii-Shynkaruk/twilioSMS-platform.git sms-platform
cd /opt/sms-platform
```

Use the production branch selected for the deployment. If `main` is the production branch:

```bash
git checkout main
```

## 4. Configure Environment Variables

Create the production environment file:

```bash
cp .env.production.example .env
```

Edit `.env` and set all production values:

```bash
nano .env
```

Required values:

- `NODE_ENV=production`
- `CLIENT_URL=https://your-domain.com`
- `DATABASE_URL=mysql://...`
- `REDIS_URL=redis://localhost:6379`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `WEBHOOK_BASE_URL=https://your-domain.com`
- `SMS_MODE=live`
- `SMTP_*` values for email OTP

Generate JWT secrets with:

```bash
openssl rand -base64 48
```

Never commit `.env` to GitHub.

## 5. Install Dependencies and Build

```bash
npm install
npm --prefix server install
npm --prefix client install

npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate:prod
npm --prefix server run build
npm --prefix client run build
```

If the instance needs initial users or seed data:

```bash
npm --prefix server run prisma:seed
```

## 6. Start the API with PM2

```bash
pm2 start server/dist/index.js --name sms-api --update-env
pm2 save
pm2 startup
```

Check the API locally:

```bash
curl -f http://127.0.0.1:3001/api/health
```

Expected result:

```json
{ "status": "ok" }
```

## 7. Configure Nginx

Create an Nginx site for the instance domain:

```bash
nano /etc/nginx/sites-available/sms-platform
```

Example:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /opt/sms-platform/client/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Enable the site:

```bash
ln -s /etc/nginx/sites-available/sms-platform /etc/nginx/sites-enabled/sms-platform
nginx -t
systemctl reload nginx
```

Install SSL with Certbot after DNS points to the droplet:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## 8. Configure Twilio Webhooks

In Twilio, configure the Messaging Service inbound webhook to:

```text
https://your-domain.com/api/webhooks/twilio/inbound
```

Configure the status callback to:

```text
https://your-domain.com/api/webhooks/twilio/status
```

Verify that the instance uses the correct Twilio credentials in `.env`.

## 9. Standard Update Workflow

Every production change must go through GitHub first.

```bash
cd /opt/sms-platform
git fetch origin
git status
git pull origin main

npm --prefix server install
npm --prefix client install
npm --prefix server run prisma:migrate:prod
npm --prefix server run build
npm --prefix client run build

pm2 restart sms-api --update-env
curl -f http://127.0.0.1:3001/api/health
```

Production should be clean after deployment:

```bash
git status --short
```

Expected output: no changes.

## 10. Multi-Instance Workflow

For two single-tenant droplets using the same repository:

1. Commit and push the feature to GitHub.
2. Deploy the same commit to instance A.
3. Deploy the same commit to instance B.
4. Keep `.env`, database credentials, Twilio credentials, and domains different per droplet.
5. Run migrations on each database.
6. Verify `/api/health` on each instance.

Do not edit files directly on the droplet. If a hotfix is needed, make the change locally, commit it, push it, then pull it on each server.

## 11. Pre-Delivery Checklist

- GitHub default branch contains the production source code.
- The production droplet runs a commit that exists in GitHub.
- `git status --short` is clean on the droplet.
- `.env` is not committed.
- No production CSV exports, logs, screenshots, backups, or temporary files are committed.
- `npm --prefix server run build` passes.
- `npm --prefix client run build` passes.
- `/api/health` returns OK.
- Admin login is verified in the browser.
