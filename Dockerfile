FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    HARBORGATE_DATA_DIR=/data

RUN addgroup -S -g 1001 harborgate \
    && adduser -S -u 1001 -G harborgate harborgate \
    && mkdir -p /app /data \
    && chown -R harborgate:harborgate /app /data

WORKDIR /app
COPY --from=build --chown=harborgate:harborgate /app/.output ./.output

USER harborgate
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
