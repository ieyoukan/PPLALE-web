# @pplale/room-server

ルームマッチ（バトルのタブ）のサーバー。ルームを持ち、対戦を進め、各プレイヤーに自分の側から見える盤面だけを WebSocket で送る。

- 対戦はサーバーだけが進める。ブラウザは操作（Command）を送り、相手の手札と山札を伏せた盤面（game-core の `viewFor`）を受け取る。乱数の種もカードの並びもブラウザには渡らない。
- Web アプリに `NEXT_PUBLIC_ROOM_SERVER_URL` を設定したときだけルームマッチが使える。未設定、またはサーバーが落ちている間は、バトルのタブにその旨が出る（CPU対決はそのまま遊べる）。
- ルームはメモリに持ち、変わるたびに `DATA_DIR/rooms/<ID>.json` へ書く。再起動しても進行中の対戦は続けられ、ブラウザは自分でつなぎ直す。

## 流れ

1. `POST /rooms` でルームを作る。ルームID（6けたの数字）と、ホストの席の秘密のトークンが返る。トークンはそのブラウザの localStorage にだけ残る（ログイン不要）。
2. 相手はルームIDか招待リンクで `GET /rooms/{id}`（ルール・ホストの名前・空きの有無）を見て、`POST /rooms/{id}/join` で席をもらう。
3. 席のあるブラウザは `WS /rooms/{id}/socket` につなぎ、最初に `{ type: "hello", token }` を送る。以後、ルームが変わるたびに `{ type: "view", view }` が届く。
4. 操作は `{ type: "action", n, action }` で送る。サーバーは実行して全員に新しい `view` を送り、送り主には `{ type: "result", n }`（拒否したときは `error` つき）を返す。
5. 2人とも `ready`（デッキつき）になると対戦が始まる。デッキはルームのルール（使えるフルーツ、拡張プレイアブルの可否）とエンジンの両方で検証する。

メッセージと盤面の型は `packages/game-core/src/room.ts`（Web アプリと共有）。

## API

| | |
| --- | --- |
| `POST /rooms` | `{ rules: { fruits, extendedPlayable }, name }` → `{ seat: 0, token, view }` |
| `GET /rooms/{id}` | `{ id, rules, host, open }`。なければ 404 |
| `POST /rooms/{id}/join` | `{ name }` → `{ seat: 1, token, view }`。満員 409 / 解散済み 410 |
| `WS /rooms/{id}/socket` | 上の流れ。`action` は `ready` `unready` `command` `resign` `rematch` `leave` |
| `GET /stats` | サーバーの状態（下） |
| `GET /healthz` | |

上の3つ（作る・入る・調べる）は送信元ごとに1時間あたりの回数を制限する（429）。対戦中の操作と `/stats` は数えない。

WebSocket を閉じるコード: `4404` ルームか席がない（直前に `{ type: "gone" }`）、`4400` 形式が違う、`4408` hello が来ない、`1012` サーバーの再起動（ブラウザはつなぎ直す）。

## 状態を見る

```
curl https://pplale-room.youkan.uk/stats
```

```json
{
  "version": "0.1.3",
  "uptime": 86400,
  "rooms": { "lobby": 1, "playing": 2, "finished": 0, "closed": 0 },
  "connections": 5,
  "since": { "roomsCreated": 14, "matchesStarted": 11, "matchesFinished": 9, "commands": 2310 }
}
```

- `rooms`：いまあるルームの数。`lobby` デッキ選択中 / `playing` 対戦中 / `finished` 対戦後 / `closed` 解散済み（10分で消える）。
- `connections`：開いている WebSocket の数（≒いま画面を開いているプレイヤー）。
- `since`：起動してからの累計。`uptime` は起動してからの秒数。
- 同じ内容がバトルのタブの「ルームサーバー：稼働中」を開くと見られる。名前・デッキ・ルームIDなど、個々のルームの中身は出さない。

ログは標準出力（起動時の1行と、想定外のエラー）。`kubectl logs` で見る。

## データ（`DATA_DIR`、クラスタではボリューム）

```
rooms/<ID>.json   ルーム1つ：ルール、両者の名前・デッキ・トークンのハッシュ、進行中の対戦の完全な状態
```

だれも操作しなくなって `ROOM_IDLE_HOURS`（既定12時間）が過ぎたルームは消える。送信元のアドレスは保存しない。

## 設定

環境変数。意味とデフォルトは `helm/pplale-room-server/values.yaml` を参照。

`PORT` `DATA_DIR` `ALLOWED_ORIGINS` `TRUST_PROXY` `REQUESTS_PER_HOUR` `MAX_ROOMS` `ROOM_IDLE_HOURS` `APP_VERSION` `CARD_DATA_DIR`

## 手元で動かす

Node が TypeScript をそのまま実行するので、ビルドは要らない。

```
npm run start --workspace=@pplale/room-server          # http://localhost:8080
npm run test:room-server
NEXT_PUBLIC_ROOM_SERVER_URL=http://localhost:8080 npm run dev   # ゲームをつなぐ
```

2つのブラウザで実際に対戦させる e2e は `e2e/room-match.spec.mjs`（冒頭に動かし方）。

コンテナ（リポジトリのルートから）:

```
docker build -f services/room-server/Dockerfile -t pplale-room-server .
docker run --rm -p 8080:8080 -v pplale-room-data:/data pplale-room-server
```

## デプロイ

`services/cpu-server` と同じ形。

1. main に入ると `.github/workflows/room-server-image.yml` がバージョンを採番し（git タグ `room-server-vX.Y.Z`）、`ghcr.io/ieyoukan/pplale-room-server:X.Y.Z` を push する。
2. `home-manifests` に Argo CD の Application を足す（`helm/pplale-room-server` を参照）:

   ```yaml
   apiVersion: argoproj.io/v1alpha1
   kind: Application
   metadata:
     name: pplale-room-server
     namespace: argocd
   spec:
     project: default
     source:
       repoURL: https://github.com/ieyoukan/PPLALE-web.git
       targetRevision: main
       path: helm/pplale-room-server
       helm:
         releaseName: pplale-room-server
         valuesObject:
           ingress:
             enabled: true
             className: cloudflare
             hosts:
               - host: pplale-room.youkan.uk
                 paths:
                   - path: /
                     pathType: Prefix
           persistence:
             storageClass: proxmox-data
     destination:
       server: https://kubernetes.default.svc
       namespace: pplale-room-server
     syncPolicy:
       automated:
         prune: true
         selfHeal: true
       syncOptions:
         - CreateNamespace=true
   ```

3. `apps/argocd/image-updater.yaml` の `applicationRefs` に足す:

   ```yaml
   - namePattern: pplale-room-server
     images:
       - alias: pplale-room-server
         imageName: ghcr.io/ieyoukan/pplale-room-server
         commonUpdateSettings:
           updateStrategy: semver
           allowTags: regexp:^[0-9]+\.[0-9]+\.[0-9]+$
         manifestTargets:
           helm:
             tag: image.tag
   ```

4. ghcr のパッケージを公開にする（または `imagePullSecrets` を設定する）。
5. Web アプリ（Vercel）の環境変数に `NEXT_PUBLIC_ROOM_SERVER_URL=https://pplale-room.youkan.uk` を設定して再デプロイする。ここで初めてルームマッチが使えるようになる。

## 知っておくこと

- **1レプリカ。** ルームはプロセスのメモリにあるので、増やすと同じルームの2人が別の Pod につながってしまう。
- **イメージが入れ替わる間（数秒〜十数秒）は接続が切れる。** ルームはボリュームから読み直され、ブラウザはつなぎ直して続きから遊べる。game-core かこのサーバーが main に入るたびに起きる。
- **エンジンやカードが変わる入れ替えでは、進行中の対戦が続けられないことがある。** 保存してあるのは対戦の状態そのものなので、状態の形が変わると読めない。
- **Web アプリとサーバーのバージョンがずれている間**（Vercel と自宅クラスタは別々に入れ替わる）、新しいカードやルールの見え方が食い違うことがある。対戦を進めるのは常にサーバーの側。
- **ルームIDは6けたの数字。** 空いているルームには ID を当てれば入れる（2人そろえば入れない）。回数の制限で総当たりを抑えているだけなので、知らない人に入られて困る用途には向かない。
- **切断した相手を待つ時間に上限はない。** 相手の接続が切れたことは画面に出る。戻らないときは自分が投了するかルームを出る。
