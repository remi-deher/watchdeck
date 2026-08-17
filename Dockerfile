FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS frontend-builder

WORKDIR /frontend

COPY package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html ./
COPY frontend/ frontend/
RUN npm ci && npm run build

# ---

FROM python:3.12-alpine@sha256:d09d15e60962ca365d1cd544a48773bac9d33f2fb1b00f2aa0deec78ade7dc31 AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev libffi-dev

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---

FROM python:3.12-alpine@sha256:d09d15e60962ca365d1cd544a48773bac9d33f2fb1b00f2aa0deec78ade7dc31

WORKDIR /app

# Version epinglee (pas le paquet generique "postgresql-client", qui suit la derniere
# version majeure d'Alpine) : pg_dump/pg_restore doivent rester compatibles avec le serveur
# postgres:15-alpine de docker-compose.yml. Un client bien plus recent que le serveur peut
# emettre une syntaxe de dump non reconnue (ex: "SET transaction_timeout", ajoute en v17) et
# faire echouer toute restauration.
RUN apk add --no-cache libffi su-exec postgresql16-client

COPY --from=builder /install /usr/local

COPY alembic/ alembic/
COPY alembic.ini .
COPY app/ app/
COPY --from=frontend-builder /frontend/app/static/vue app/static/vue
COPY scripts/ scripts/
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Renseignes par docker-publish.yml (--build-arg) ; restent aux valeurs par defaut
# pour un build local (`docker compose up --build`), ce qui identifie clairement
# une image "dev" dans /api/system/version plutot que de mentir sur la version.
ARG APP_VERSION=0.0.0-dev
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
ARG BRANCH=unknown
RUN printf '{"version":"%s","git_sha":"%s","build_date":"%s","branch":"%s"}' \
    "$APP_VERSION" "$GIT_SHA" "$BUILD_DATE" "$BRANCH" > app/version.json

RUN addgroup -S app && adduser -S -G app app && \
    mkdir -p /app/data && \
    chown -R app:app /app && \
    chmod +x /docker-entrypoint.sh && \
    pip uninstall -y pip setuptools

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
