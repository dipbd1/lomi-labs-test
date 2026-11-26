FROM node:22-alpine AS build
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY fixtures ./fixtures
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://lomi:lomi@localhost:5432/lomi
RUN pnpm --filter @lomi/contracts build
RUN pnpm --filter @lomi/api build

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=build /app /app
ENV FIXTURES_DIR=/app/fixtures
ENV PDF_DIR=/data/pdfs
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "/app/apps/api/docker-entrypoint.sh"]
