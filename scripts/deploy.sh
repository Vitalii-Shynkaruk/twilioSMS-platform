#!/bin/bash
set -euo pipefail

# ============================================
# SCL SMS Platform — Production Deploy Script
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} SCL SMS Platform — Deploy${NC}"
echo -e "${GREEN}========================================${NC}"

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Error: docker is not installed${NC}"; exit 1; }
command -v docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}Error: docker compose is not installed${NC}"; exit 1; }

# Check .env file
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo -e "${YELLOW}Copy .env.production.example to .env and configure it:${NC}"
    echo "  cp .env.production.example .env"
    echo "  nano .env"
    exit 1
fi

# Validate critical env vars
source .env

check_var() {
    local var_name=$1
    local var_value=${!var_name:-}
    if [ -z "$var_value" ] || [[ "$var_value" == *"GENERATE"* ]] || [[ "$var_value" == *"CHANGE"* ]] || [[ "$var_value" == *"change"* ]] || [[ "$var_value" == *"yourdomain"* ]]; then
        echo -e "${RED}Error: $var_name is not set or still has placeholder value${NC}"
        return 1
    fi
}

echo -e "\n${YELLOW}Validating environment...${NC}"
ERRORS=0
for var in JWT_SECRET JWT_REFRESH_SECRET POSTGRES_PASSWORD REDIS_PASSWORD ADMIN_EMAIL ADMIN_PASSWORD CLIENT_URL WEBHOOK_BASE_URL; do
    if ! check_var "$var"; then
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo -e "\n${RED}Found $ERRORS configuration errors. Fix .env file and retry.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Environment validated${NC}"

# Check SSL
echo -e "\n${YELLOW}Checking SSL certificates...${NC}"
if [ ! -f ssl/fullchain.pem ] || [ ! -f ssl/privkey.pem ]; then
    echo -e "${RED}SSL certificates not found in ssl/ directory${NC}"
    echo -e "${YELLOW}Options:${NC}"
    echo "  1. Use Let's Encrypt: certbot certonly --standalone -d yourdomain.com"
    echo "  2. Generate self-signed (testing only):"
    echo "     mkdir -p ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/privkey.pem -out ssl/fullchain.pem"
    echo ""
    read -p "Continue without SSL? (nginx will fail) [y/N]: " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ SSL certificates found${NC}"
fi

# Build and deploy
echo -e "\n${YELLOW}Building and deploying...${NC}"
docker compose build --no-cache
docker compose up -d

echo -e "\n${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Check service health
echo -e "\n${YELLOW}Checking service health...${NC}"
SERVICES=("scl-postgres" "scl-redis" "scl-app" "scl-nginx")
for service in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "not found")
    if [ "$STATUS" = "running" ]; then
        echo -e "  ${GREEN}✓ $service: running${NC}"
    else
        echo -e "  ${RED}✗ $service: $STATUS${NC}"
    fi
done

# Run migrations
echo -e "\n${YELLOW}Running database migrations...${NC}"
docker compose exec -T app npx prisma migrate deploy
echo -e "${GREEN}✓ Migrations applied${NC}"

# Seed database
echo -e "\n${YELLOW}Seeding database...${NC}"
docker compose exec -T app npx prisma db seed || echo -e "${YELLOW}⚠ Seed skipped (may already exist)${NC}"

# Health check
echo -e "\n${YELLOW}Running health check...${NC}"
sleep 3
HEALTH=$(curl -sk https://localhost/api/health 2>/dev/null || curl -sk http://localhost/api/health 2>/dev/null || echo "failed")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${YELLOW}⚠ Health check returned: $HEALTH${NC}"
    echo "  (This may be normal if SSL is not configured yet)"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify: curl -k https://yourdomain.com/api/health"
echo "  2. Set Twilio webhooks to https://yourdomain.com/api/webhooks/twilio/incoming"
echo "  3. Login at https://yourdomain.com"
echo ""
echo "Logs: docker compose logs -f"
