# =====================================================================
# Taller Digital — imagen de producción
# Un solo contenedor: la API de Express sirve también el frontend de Angular.
# =====================================================================

# 1) Build del frontend
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build

# 2) Imagen final: solo el backend con dependencias de producción + el build del front
FROM node:22-alpine
ENV NODE_ENV=production \
    FRONTEND_DIST=/app/public
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/src ./backend/src
COPY backend/scripts ./backend/scripts
COPY database ./database
COPY --from=frontend /app/frontend/dist/frontend/browser ./public

USER node
WORKDIR /app/backend
EXPOSE 3000

# Crea las tablas si es la primera vez y arranca la API.
CMD ["sh", "-c", "node scripts/init-db.js && node src/server.js"]
