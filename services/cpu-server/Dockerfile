# The CPU server. Build from the repository root (it needs the engine and the card data):
#   docker build -f services/cpu-server/Dockerfile -t pplale-cpu-server .
# Node runs the TypeScript sources directly, so there is no build step.
FROM node:22.23.2-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/
COPY services/cpu-server/package.json services/cpu-server/
# Only the server and the engine: none of the web app's dependencies.
RUN npm ci --omit=dev --ignore-scripts --workspace=@pplale/cpu-server --workspace=@pplale/game-core --include-workspace-root=false

COPY packages/game-core/src packages/game-core/src
COPY services/cpu-server/src services/cpu-server/src
COPY src/data/yojo.json src/data/sweet.json src/data/playable.json src/data/tokenYojo.json src/data/token.json src/data/

# Matches, models and self-play data live here: mount a volume.
RUN mkdir /data && chown 65532:65532 /data
VOLUME /data

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=8080 DATA_DIR=/data
USER 65532:65532
EXPOSE 8080
WORKDIR /app/services/cpu-server
CMD ["node", "src/main.ts"]
