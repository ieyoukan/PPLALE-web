# @pplale/room-server

ルームマッチ（バトルのタブ）のサーバー。ルームを持ち、対戦を進め、各プレイヤーに自分の側から見える盤面だけを WebSocket で送る。

- 対戦はサーバーだけが進める。ブラウザは操作（Command）を送り、相手の手札と山札を伏せた盤面（game-core の `viewFor`）を受け取る。乱数の種もカードの並びもブラウザには渡らない。
- Web アプリに `NEXT_PUBLIC_ROOM_SERVER_URL` を設定したときだけルームマッチが使える。未設定、またはサーバーが落ちている間は、バトルのタブにその旨が出る（CPU対決はそのまま遊べる）。
- ルームは Redis に置く。サーバーの Pod が持つのは WebSocket の接続だけなので、何台で動かしてもよく、Pod を入れ替えても進行中の対戦は続く（つながっていたブラウザが別の Pod につなぎ直す）。

## 流れ

1. `POST /rooms` でルームを作る。ルームID（6けたの数字）と、ホストの席の秘密のトークンが返る。トークンはそのブラウザの localStorage にだけ残る（ログイン不要）。
2. 相手はルームIDか招待リンクで `GET /rooms/{id}`（ルール・ホストの名前・空きの有無）を見て、`POST /rooms/{id}/join` で席をもらう。
3. 席のあるブラウザは `WS /rooms/{id}/socket` につなぎ、最初に `{ type: "hello", token }` を送る。以後、ルームが変わるたびに `{ type: "view", view }` が届く。
4. 操作は `{ type: "action", n, action }` で送る。サーバーは実行して全員に新しい `view` を送り、送り主には `{ type: "result", n }`（拒否したときは `error` つき）を返す。
5. 観戦を許可したルームには、席のない人も `{ type: "hello", watch: true }` でつなげる。届く `view` は `watching: true` つきで、両方の手札が見える（山札は見えない）。操作は送れない。いま何人が観戦しているか（`spectators`）は全員の `view` に入る。
6. 2人とも `ready`（デッキつき）になると対戦が始まる。デッキはルームのルール（使えるフルーツ、拡張プレイアブルの可否）とエンジンの両方で検証する。

メッセージと盤面の型は `packages/game-core/src/room.ts`（Web アプリと共有）。

## API

| | |
| --- | --- |
| `POST /rooms` | `{ rules: { fruits, extendedPlayable, spectators }, name }` → `{ seat: 0, token, view }` |
| `GET /rooms/{id}` | `{ id, rules, host, open, spectators }`。なければ 404 |
| `POST /rooms/{id}/join` | `{ name }` → `{ seat: 1, token, view }`。満員 409 / 解散済み 410 |
| `WS /rooms/{id}/socket` | 上の流れ。`action` は `ready` `unready` `command` `resign` `rematch` `leave`。観戦は `hello` に `watch: true` |
| `GET /stats` | サーバーの状態（下） |
| `GET /healthz` | プロセスが動いている（liveness） |
| `GET /readyz` | Redis に届く（readiness）。届かなければ 503 |

上の3つ（作る・入る・調べる）は送信元ごとに1時間あたりの回数を制限する（429。Pod ごとに数える）。対戦中の操作と `/stats` は数えない。

WebSocket を閉じるコード: `4404` ルームか席がない・観戦できない（直前に `{ type: "gone" }`）、`4400` 形式が違う、`4408` hello が来ない、`1012` Pod の入れ替え（ブラウザはつなぎ直す）。

## Redis の使い方（`src/backend.ts`）

```
pplale:room:{id}        hash    json（ルーム全体）, v（バージョン）, st（状態）。最後の変更から ROOM_IDLE_HOURS で消える
pplale:on:{id}:{spot}   zset    席（0, 1）または観戦者（2）の開いている接続。スコアは「更新されなければ消える時刻」
pplale:pod:{pod}        string  その Pod の接続数。Pod が止まると消える
pplale:totals           hash    累計（作ったルーム、始まった対戦、終わった対戦、操作）
pplale:rooms            channel ルームが変わったことを Pod どうしで知らせる
```

- **ルームの変更は compare-and-set。** 読む → game-core で実行 → 「バージョンが読んだときのままなら書く」を Lua で1回に行う。別の Pod の操作が先に入っていたら読み直してやり直す。ロックは持たない。
- **変更した Pod が自分の接続に盤面を送り、`pplale:rooms` で他の Pod に知らせる。** 受け取った Pod は、そのルームの接続を持っていれば盤面を送る。同じルームの2人が別の Pod につながっていてよい。
- **接続中かどうか**は席ごとの zset。Pod は `BEAT_SECONDS`（15秒）ごとに自分の接続を更新し、3回ぶん更新されなかった接続は消える。Pod が突然落ちても、残った Pod が次の更新のときに気づいて相手に「切断」を伝える。
- `REDIS_URL` がなければ同じものをプロセス内に持つ（1台だけ、再起動で消える）。手元で動かすときとテスト用。

## 状態を見る

```
curl https://pplale-room.youkan.uk/stats
```

```json
{
  "version": "0.1.3",
  "uptime": 86400,
  "backend": "redis",
  "pods": 2,
  "rooms": { "lobby": 1, "playing": 2, "finished": 0, "closed": 0 },
  "connections": 5,
  "total": { "roomsCreated": 14, "matchesStarted": 11, "matchesFinished": 9, "commands": 2310 }
}
```

- `rooms`：いまあるルームの数。`lobby` デッキ選択中 / `playing` 対戦中 / `finished` 対戦後 / `closed` 解散済み（10分で消える）。
- `connections`：全 Pod の開いている WebSocket の数（≒いま画面を開いているプレイヤー）。`pods`：動いている Pod の数。どちらも Pod が15秒ごとに申告した値。
- `total`：Redis のデータが始まってからの累計（Pod が入れ替わっても続く）。
- `version` と `uptime`（秒）は、答えた Pod のもの。`backend` が `memory` なら Redis なしで動いている。
- 名前・デッキ・ルームIDなど、個々のルームの中身は出さない。数は最大5秒前のもの。

Redis を直接見るとき（名前空間 `pplale-room-server`）:

```
kubectl exec -n pplale-room-server sts/pplale-room-server-redis -- redis-cli --scan --pattern 'pplale:room:*'
kubectl exec -n pplale-room-server sts/pplale-room-server-redis -- redis-cli hgetall pplale:totals
```

ログは標準出力（起動時の1行と、想定外のエラー）。`kubectl logs` で見る。

## 設定

環境変数。意味とデフォルトは `helm/pplale-room-server/values.yaml` を参照。

`PORT` `REDIS_URL` `ALLOWED_ORIGINS` `TRUST_PROXY` `REQUESTS_PER_HOUR` `ROOMS_PER_HOUR` `LOBBY_GRACE_MINUTES` `ABANDON_MINUTES` `MAX_ROOMS` `ROOM_IDLE_HOURS` `BEAT_SECONDS` `APP_VERSION` `CARD_DATA_DIR`

Redis に入るのは、ルームのルール、両者の名前・デッキ・トークンのハッシュ、進行中の対戦の完全な状態。送信元のアドレスは保存しない。

## 手元で動かす

Node が TypeScript をそのまま実行するので、ビルドは要らない。

```
npm run start --workspace=@pplale/room-server          # http://localhost:8080（Redis なし）
docker run --rm -p 6379:6379 redis:7.4-alpine
REDIS_URL=redis://localhost:6379 npm run start --workspace=@pplale/room-server
NEXT_PUBLIC_ROOM_SERVER_URL=http://localhost:8080 npm run dev   # ゲームをつなぐ
```

テストは、複数の Pod が同じルームを扱う場合も含めてプロセス内の代役で動く。`REDIS_URL` を付けると同じテストが本物の Redis で動く（CI は両方）。

```
npm run test:room-server
REDIS_URL=redis://localhost:6379 npm run test:room-server
```

2つのブラウザで実際に対戦させる e2e は `e2e/room-match.spec.mjs`（冒頭に動かし方）。

コンテナ（リポジトリのルートから）:

```
docker build -f services/room-server/Dockerfile -t pplale-room-server .
docker run --rm -p 8080:8080 -e REDIS_URL=redis://host.docker.internal:6379 pplale-room-server
```

## デプロイ

`services/cpu-server` と同じ形。

1. ルームサーバーの動きが変わる変更（サーバー本体、game-core のうち CPU の思考・学習以外、カードのデータ）が main に入ると `.github/workflows/room-server-image.yml` がバージョンを採番し（git タグ `room-server-vX.Y.Z`）、`ghcr.io/ieyoukan/pplale-room-server:X.Y.Z` を push する。
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
           redis:
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

## ルームが消えるとき

- **対戦前にホストがいない**：ホストの接続が `LOBBY_GRACE_MINUTES`（10分）ないとルームは解散する。作っただけで開かなかったルームも同じ。募集を X や Discord に貼りに行く間（スマホでは画面を離れると接続が切れることがある）に消えないよう長めにしている。ホストが「ルームを解散する」を押せばすぐ消える。
- **対戦前にゲストがいない**：同じ時間で席が空き、別の人が入れるようになる。
- **対戦中・対戦後に2人ともいない**：`ABANDON_MINUTES`（30分）で解散する。片方だけ残っているときは、その人が投了するか出るまで残る。
- **それ以外**：最後の変更から `ROOM_IDLE_HOURS`（12時間）で消える。解散したルームは10分残してから消す（最後のプレイヤーに解散を伝えるため）。
- Pod はそれぞれ `BEAT_SECONDS` ごとに全ルームを見て判断する（同時に見ても compare-and-set なので二重には効かない）。

ルームの数の上限は `MAX_ROOMS`（500）。1つの送信元が作れるのは1時間に `ROOMS_PER_HOUR`（10、Pod ごと）までで、開かないルームは10分で消えるため、1人が場を埋めることはできない。

`/stats` のルームの数や接続数は運用のためのもので、ゲームの画面には出さない（「稼働中 / つながらない」だけを出す）。

## 知っておくこと

- **Pod の入れ替えでは対戦は切れない。** 新しい Pod が受けられるようになってから古い Pod を止め、止まる Pod につながっていたブラウザは1秒ほどで別の Pod につなぎ直す。その間、画面に「再接続しています」と出る。
- **Redis は1台。** Redis が止まっている間はルームマッチが使えない（`/readyz` が 503 になり、つなぎ直しを待つ）。データはボリュームに毎秒書いているので、Redis が戻れば続きから遊べる。チャートの Redis の代わりに `redis.url` で別の Redis を指せる。
- **エンジンやカードが変わる入れ替えでは、進行中の対戦が続けられないことがある。** 保存してあるのは対戦の状態そのものなので、状態の形が変わると読めない。入れ替えの途中は新旧の Pod が同じルームを扱う。
- **Web アプリとサーバーのバージョンがずれている間**（Vercel と自宅クラスタは別々に入れ替わる）、新しいカードやルールの見え方が食い違うことがある。対戦を進めるのは常にサーバーの側。
- **観戦者には両方の手札が見える。** 観戦を許可したルームでは、対戦している本人が別のブラウザで観戦すれば相手の手札を見られる。防ぐ仕組みはなく、観戦の可否と人数を2人に見せているだけ。既定は観戦なしで、ルームを作る人が選ぶ。観戦は1ルーム30人まで。
- **ルームIDは6けたの数字。** 空いているルームには ID を当てれば入れる（2人そろえば入れない）。回数の制限で総当たりを抑えているだけなので、知らない人に入られて困る用途には向かない。
- **切断した相手を待つ時間に上限はない。** 相手の接続が切れたことは画面に出る。戻らないときは自分が投了するかルームを出る。
