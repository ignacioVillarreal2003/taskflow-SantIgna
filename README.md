# TaskFlow 🗂️

Proyecto integrador del curso **Testing y Calidad de Software**.  
App de gestión de tareas (tipo Jira simplificado) con suite completa de tests.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React 18 + TypeScript + Vite |
| ORM | Prisma + PostgreSQL |
| Unit/Integration | Vitest + Supertest |
| BDD | Cucumber.js + Gherkin |
| E2E | Playwright |
| Performance | k6 |
| CI/CD | GitHub Actions |

---

## Estado actual

> **Frontend (`apps/web`) no está implementado aún.**
> La API (backend) está completa y todos los tests corren contra ella.
> El comando `npm run dev` levanta solo la API; el error de `apps/web` es esperado.

---

## Prerequisitos

- Node.js 20+
- PostgreSQL local (ver opciones abajo)
- Docker (opcional)

### Opción A — PostgreSQL del sistema (Homebrew)

Si ya tenés PostgreSQL corriendo en tu máquina (puerto 5432):

```bash
createdb taskflow_dev
```

En `apps/api/.env`:
```
DATABASE_URL="postgresql://<tu-usuario-de-sistema>@localhost:5432/taskflow_dev"
```

### Opción B — Docker

Si no tenés PostgreSQL instalado, levantá un contenedor.
**Importante:** si ya hay un PostgreSQL del sistema corriendo en el puerto 5432, usá un puerto distinto (ej. 5433).

```bash
docker run --name taskflow-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

En `apps/api/.env`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
```

Para iniciar/detener el contenedor:
```bash
docker start taskflow-db
docker stop taskflow-db
```

---

## Inicio rápido

```bash
# 1. Instalar dependencias (desde la raíz)
npm install

# 2. Configurar variables de entorno
cp apps/api/.env.example apps/api/.env
# Editar DATABASE_URL según la opción elegida arriba
# Agregar JWT_SECRET=cualquier-string-secreto

# 3. Aplicar migraciones
cd apps/api
npx prisma migrate deploy --schema=src/prisma/schema.prisma

# 4. Levantar la API
cd ../..
npm run dev
# API disponible en http://localhost:3001
# (el error de apps/web es esperado — frontend pendiente)
```

> **Nota:** `npx prisma db seed` no está configurado aún. Podés ignorar ese paso.

---

## Correr los tests

```bash
# Unit tests con coverage
npm run test:unit

# Integration tests
npm run test:integration

# BDD / Cucumber
npm run test:bdd

# E2E con Playwright (requiere app corriendo)
npm run test:e2e

# Todos
npm run test:all

# Performance (requiere k6 instalado)
k6 run performance/scenarios/api-load.k6.js
```

---

## Estructura

```
taskflow/
├── apps/api/          # Backend Express + TS
│   ├── src/
│   │   ├── routes/
│   │   ├── services/  ← lógica de negocio + bugs intencionales
│   │   ├── middleware/
│   │   └── prisma/
│   └── tests/
│       ├── unit/      ← Vitest — lógica pura
│       └── integration/ ← Vitest + Supertest
├── apps/web/          # Frontend React + TS
├── e2e/               # Playwright + Cucumber
│   ├── features/      ← archivos .feature (Gherkin)
│   ├── pages/         ← Page Object Model
│   └── step-definitions/
├── performance/       ← k6 scripts
├── docs/adr/          ← Architecture Decision Records
└── .github/workflows/ ← CI/CD pipelines
```

---

## Hitos del semestre

| Clase | Entregable |
|-------|-----------|
| 3 | Repo + pipeline lint verde |
| 5 | US-01 y US-02 con unit + integration tests |
| 7 | US-03–05 + escenarios BDD pasando |
| 9 | US-06–08 + coverage ≥ 80% |
| 11 | E2E flujos críticos + contract tests |
| 13 | Scripts k6 + reporte SLOs |
| 15 | Suite completa + ADR + trazabilidad |
| 16 | Demo day 🎉 |

---

## Definition of Done

Una US está DONE cuando:
- [ ] Código compila sin errores TS
- [ ] Unit tests pasan con coverage ≥ 80%
- [ ] Integration tests cubren happy path + 2 casos de error
- [ ] Escenarios Gherkin implementados y pasando
- [ ] Sin errores ESLint
- [ ] Pipeline CI verde
- [ ] Matriz de trazabilidad actualizada
- [ ] PR con al menos 1 review aprobado
