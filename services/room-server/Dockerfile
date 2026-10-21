# The room server. Build from the repository root (it needs the engine and the card data):
#   docker build -f services/room-server/Dockerfile -t pplale-room-server .
# Node runs the TypeScript sources directly, so there is no build step.
FROM node:26.12.1-alpine

WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g pnpm@10.33.2
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
# The web app's root manifest is not copied: this image only needs the server and the engine.
RUN echo '{"name":"service-root","private":true}' > package.json
COPY packages/game-core/package.json packages/game-core/
COPY services/room-server/package.json services/room-server/
# Only the server and the engine: none of the web app's dependencies.
RUN pnpm install --no-frozen-lockfile --prod --ignore-scripts --filter @pplale/room-server...

COPY packages/game-core/src packages/game-core/src
COPY services/room-server/src services/room-server/src
COPY services/shared services/shared
COPY services/room-server/scripts/verify-history.ts services/room-server/scripts/verify-history.ts
COPY src/data/yojo.json src/data/sweet.json src/data/playable.json src/data/tokenYojo.json src/data/token.json src/data/

COPY public/images/yojo public/images/yojo
COPY public/images/sweet public/images/sweet
COPY public/images/playable public/images/playable
COPY public/images/token public/images/token

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=8080
USER 65532:65532
EXPOSE 8080
WORKDIR /app/services/room-server
CMD ["node", "src/main.ts"]
