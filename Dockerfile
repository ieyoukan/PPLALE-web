FROM node:26.12.1-alpine AS builder

WORKDIR /app

# 依存関係のインストール
RUN npm install -g pnpm@10.33.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/game-core/package.json packages/game-core/
COPY services/cpu-server/package.json services/cpu-server/
COPY services/room-server/package.json services/room-server/
RUN pnpm install --frozen-lockfile

# ソースコードのコピー
COPY . .

# 環境変数ファイルのコピー（.env.productionは.gitignoreに追加）
COPY .env.production .env

# ビルド
RUN pnpm run build

# 本番環境用のイメージ
FROM node:26.12.1-alpine AS runner

WORKDIR /app

# 必要なファイルのみをコピー
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 環境変数ファイルのコピー
COPY --from=builder /app/.env ./

# ログディレクトリの作成
RUN mkdir -p /app/logs && chmod 777 /app/logs

# 本番環境の設定
ENV NODE_ENV=production
ENV PORT=3000

# ボリュームの設定
VOLUME ["/app/logs"]

# アプリケーションの起動
CMD ["node", "server.js"]
