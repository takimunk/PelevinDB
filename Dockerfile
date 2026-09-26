FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG APP_REVISION=unknown
ENV APP_REVISION=$APP_REVISION
LABEL org.opencontainers.image.source="https://github.com/takimunk/xbook"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 XBOOK_DB=/app/data/xbook.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "server/healthcheck.ts"]
CMD ["node", "server/index.ts"]
