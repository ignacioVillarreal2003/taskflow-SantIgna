#!/usr/bin/env bash
set -e

# ────────────────────────────────────────────────────────────
#  TaskFlow — Setup script
#  Uso: bash setup.sh
# ────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET} $1"; }
warn() { echo -e "${YELLOW}  !${RESET} $1"; }
fail() { echo -e "${RED}  ✗ ERROR:${RESET} $1"; exit 1; }
step() { echo -e "\n${BOLD}$1${RESET}"; }

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/apps/api"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       TaskFlow — Setup               ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════╝${RESET}"

# ── 1. Prerrequisitos ────────────────────────────────────────
step "1. Verificando prerrequisitos..."

node --version &>/dev/null || fail "Node.js no encontrado. Instalá Node 20+."
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
[ "$NODE_MAJOR" -ge 20 ] || fail "Se requiere Node.js 20+. Versión actual: $(node --version)"
ok "Node.js $(node --version)"

npm --version &>/dev/null || fail "npm no encontrado."
ok "npm $(npm --version)"

# pg_isready -h localhost -p 5432 &>/dev/null || fail "PostgreSQL no está corriendo en localhost:5432. Levantalo con 'brew services start postgresql' o Docker."
ok "PostgreSQL disponible en localhost:5432"

# ── 2. Variables de entorno ──────────────────────────────────
step "2. Variables de entorno..."

if [ ! -f "$API_DIR/.env" ]; then
  if [ -f "$API_DIR/.env.example" ]; then
    cp "$API_DIR/.env.example" "$API_DIR/.env"
    warn ".env creado desde .env.example — revisá DATABASE_URL y JWT_SECRET"
  else
    cat > "$API_DIR/.env" <<EOF
DATABASE_URL="postgresql://${USER}@localhost:5432/taskflow_dev"
JWT_SECRET="taskflow-dev-secret-$(openssl rand -hex 8 2>/dev/null || echo 'changeme')"
PORT=3001
NODE_ENV=development
EOF
    warn ".env creado con valores por defecto para el usuario '$USER'"
  fi
else
  ok ".env ya existe"
fi

# Verificar que DATABASE_URL está seteada
source "$API_DIR/.env" 2>/dev/null || true
[ -n "$DATABASE_URL" ] || fail "DATABASE_URL no está definida en apps/api/.env"
ok "DATABASE_URL configurada"

# ── 3. Dependencias ──────────────────────────────────────────
step "3. Instalando dependencias..."

cd "$ROOT_DIR"
npm install --silent
ok "Dependencias instaladas"

cd "$API_DIR"
npx prisma generate --schema=src/prisma/schema.prisma 2>&1 | grep -E "Generated|✓" | while read -r line; do ok "$line"; done || true
ok "Prisma client generado"

# ── 4. Base de datos ─────────────────────────────────────────
step "4. Base de datos..."

# Crear la base si no existe
DB_NAME=$(echo "$DATABASE_URL" | sed 's/.*\///')
psql -h localhost -U "$USER" -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$DB_NAME" \
  && ok "Base de datos '$DB_NAME' existe" \
  || { createdb "$DB_NAME" 2>/dev/null && ok "Base de datos '$DB_NAME' creada"; }

# Migraciones
cd "$API_DIR"
npx prisma migrate deploy --schema=src/prisma/schema.prisma 2>&1 | grep -E "Applied|No pending|already" | while read -r line; do ok "$line"; done || true
ok "Migraciones aplicadas"

# Seed
echo "   Cargando datos de prueba..."
npx prisma db seed --schema=src/prisma/schema.prisma 2>&1 | grep -E "✓|✅|Usuarios|Proyectos|Tareas|Comentarios|→" | while read -r line; do echo "  $line"; done
ok "Seed completado"

# ── 5. Resumen ───────────────────────────────────────────────
cd "$ROOT_DIR"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║  ✅  Setup completo                                  ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Usuarios de prueba${RESET} (contraseña: ${BOLD}Password1${RESET})"
echo "    alice@taskflow.dev"
echo "    bob@taskflow.dev"
echo ""
echo -e "  ${BOLD}Para levantar la app:${RESET}"
echo "    npm run dev          # API + Frontend juntos"
echo "    npm run dev:web      # Solo frontend  → http://localhost:5173"
echo ""
echo -e "  ${BOLD}Para correr los tests:${RESET}"
echo "    npm run test:unit"
echo "    npm run test:integration"
echo ""
