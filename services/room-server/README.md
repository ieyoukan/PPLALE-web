# @pplale/room-server

フリーマッチとルームマッチ（バトルのタブ）のサーバー。対戦相手を探し、ルームを持ち、対戦を進め、各プレイヤーに自分の側から見える盤面だけを WebSocket で送る。

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

インスタンス型ルームのチャットは在室者全員（ゲスト・観戦者を含む）が送信できる。対応するクライアントは`hello`に`chat: true`を付け、`{ action: 'chat', text, messageId: UUID }`を通常の`action`で送る。返信は`{ type: 'chat', id, version, messages }`と送信者への`result`で、ゲームの`view`は送らない。初回・再接続時だけ`plaza.chat`に最新50件を含め、その後は`plaza.chatEnabled: true`で対応を示す。300コードポイント、各メンバー1秒に1回。再試行は同一ID・同一本文で重複を防ぐ。発言者はサーバー側で確定し、対戦状態・時計・リプレイは変更しない。別Podへも既存のルーム配信に`chat: true`を付けて伝え、対応を表明していない旧ブラウザには新しいメッセージ種別を送らない。履歴はルーム状態にだけ保存し、別インスタンスへ引き継がない。UIの仕様は[ルーム設計](../../docs/social-rooms-design.md#ルーム内チャット2026-10-28)に集約する。

## API

| | |
| --- | --- |
| `POST /rooms` | `{ rules: { fruits, extendedPlayable, spectators }, name }` → `{ seat: 0, token, view }` |
| `GET /rooms/{id}` | `{ id, rules, host, open, spectators }`。なければ 404 |
| `POST /rooms/{id}/join` | `{ name }` → `{ seat: 1, token, view }`。満員 409 / 解散済み 410 |
| `WS /rooms/{id}/socket` | 上の流れ。`action` は `ready` `unready` `command` `resign` `rematch` `leave`。観戦は `hello` に `watch: true` |
| `POST /rooms`（`plaza` 付き） | 集まれるルームを作る → `{ token, view }`。`plaza.from` で閉じたルームの後継に入る |
| `POST /rooms/location` | `{ to }` → 自分・承認済みフレンドの現在地。接続なしは `offline`、入室不可は `private`＋公開範囲のみ、入室権限がある場合はインバイト系も含めて `room`＋ルーム情報（招待トークンなし） |
| `POST /rooms/lookup` | `{ ids }` → `{ rooms }`。尋ねた人が入れるルームだけ（フレンドの現在地） |
| `POST /rooms/invited` | ログイン必須。名指しで招待されているルーム |
| `POST /rooms/ask` | `{ to }` ログイン必須。フレンドのいるインバイト系ルームへ招待をリクエスト（結果は返さない） |
| `POST /rooms/{id}/invite` | `{ member, to }` ログイン必須。在室者がフレンドを名指しで招待し、通知する（フレンド関係を Firestore で確認）。名指しの許可で入れるようになるのはインバイト系のルームだけ |
| `GET /push/key` | `{ publicKey }`。ブラウザが購読に使う VAPID 公開鍵。鍵がなければ `null`（通知のベルを出さない） |
| `POST /push/subscribe` | `{ subscription }` → このブラウザの通知先を登録（ログイン必須） |
| `POST /push/unsubscribe` | `{ endpoint }` → 登録を外す |
| `POST /push/friend` | `{ to, kind: "request" \| "accepted" }` → 相手にフレンド申請・承認を通知。Firestore で実際の状態を確かめる |
| `POST /push/recruit` | `{ roomId }` → 募集中のルームをフレンドに通知 |
| `GET /stats` | サーバーの状態（下） |
| `GET /healthz` | プロセスが動いている（liveness） |
| `GET /readyz` | Redis に届く（readiness）。届かなければ 503 |

上の3つ（作る・入る・調べる）は送信元ごとに1時間あたりの回数を制限する（429。Pod ごとに数える）。対戦中の操作と `/stats` はこの時間単位の制限には数えない。

WebSocket を閉じるコード: `4404` ルームか席がない・観戦できない（直前に `{ type: "gone" }`）、`4400` 形式が違う、`4408` hello が来ない、`1012` Pod の入れ替え（ブラウザはつなぎ直す）。

## 集まれるルーム（プラザ、`src/plaza.ts`）

ゲームの起動入口（`/game/`）と共有リンクが使うルーム。人が集まる場所の中に対戦席が2つあり、1つの対戦を在室者全員で見る。設計と実装で決めた初期値は [集まって遊べるルームの設計](../../docs/social-rooms-design.md) の13章。

- `POST /rooms` に `plaza: { name, visibility }` を付けると作る。作成者は席に座らず入室し、最初のオーナーになる。名前（16文字）と公開範囲は作成後に変えられない。公開範囲が不正・未指定ならインバイト。ゲストはフレンド系を作れない。
- 返るのは席ではなく入室者の秘密（`{ token, view }`）。`view.plaza` に名前・公開範囲・作成者・オーナー・自分（`me`）・在室者が入る。WebSocket の `hello` は同じ `token` を使う。
- 入室は `POST /rooms/{id}/join { name, invite?, rejoin? }`。パブリックは誰でも、フレンドは作成者のフレンド、フレンド＋は作成者か在室者のフレンド（Firestore を本人の ID token で読む）、インバイト系は招待リンクの秘密（`invite`）か名指しの許可。入れない部屋は存在しない部屋と同じ 404 にする。同じアカウントの別端末は同じ入室者になる（秘密は最大4つ）。
- `GET /rooms/{id}?invite=` も入れる人にだけ情報を返す。`POST /rooms/lookup { ids }` はフレンド画面向けにまとめて返す（入れる部屋だけ）。`POST /rooms/invited` は名指しで招待されている部屋、`POST /rooms/ask { to }` はフレンドのいるインバイト系の部屋への招待のリクエスト（部屋があるかどうかは返さない）。この2つは全ルームを1回読んだ索引を15秒使い回す。
- `POST /rooms/browse { known?: [{ id, token?, invite? }] }` は、入れる集まれるルームを全件返す（24件のID照会上限は適用しない）。ゲストはパブリックと、有効な秘密を持つルームを閲覧でき、ログイン中はフレンド関係・名指しの招待・作成者本人の入室権限も使う。入室と同じ `mayEnter` で検証し、秘密の値は応答に含めない。閉鎖・無人・未入室者にとって満員のルームは除外する。バックエンドは50件ずつ読み、1回の要求内でフレンド一覧の照会を共有する。画面を開いている間は15秒おき・再表示時・更新ボタンで再取得する。
- 操作（`action`）: `sit` `stand` `ready` `unready` `cpu` `dismissCpu` `rematch`（席を維持して次へ） `claim`（オーナー不在のとき。ログイン済みの在室者をゲストより優先） `rules`（オーナー。対戦中は次の対戦から） `renewInvite` `invite`（名指し） `answer`（リクエストへの返事） `leave`。招待を出せるのはインバイトではオーナー、それ以外では在室者。
- 席に座っていない人は観戦者として、両者の手札が見える盤面（`spectator`）を受け取る。山札の中身・順番は伏せたままにする。リプレイの案内は着席者だけ。
- CPU は空席に1体まで。強さとデッキ（初期値はルールに合うおまかせ、おためし・保存デッキも選択可）を選ぶ。対戦前はCPUの席から変更でき、送られたデッキはプレイヤーと同じルールで検証する。ルール変更時はおまかせに戻す。サーバーが worker thread で手を決め（さいきょうで最大1秒ほど）、ほかの操作と同じ CAS で反映する。同じ局面の手は `pplale:claim:cpu:{id}:{version}` を取った1台だけが打つ。部屋の接続を持つ Pod が担当し、Pod が落ちても定期処理で引き継ぐ。

### 在室と閉鎖

- 在室は入室者ごとの接続（`pplale:on:{id}:m`、値は `{入室者}~{接続}`）。最後の接続が切れてから `MEMBER_GRACE`（2分）で不在が確定し、部屋から外れる。スマホで Discord に切り替えてリンクを貼る間に部屋が消えないための猶予。作成から最初の接続までも同じ。
- 同じ秘密での再接続・再入室はゲストも既存メンバーに戻し、席・準備・オーナーを重複作成しない。猶予切れ後の元オーナーは`POST /rooms/{id}/join`の`rejoin`で直前の秘密と同じ認証状態を証明でき、オーナー不在の場合だけ役割を復元する。他者の引き継ぎ・明示的な退出・アカウント変更では復元しない。公開ビューには復旧用の秘密を含めず、取得可否だけを`plaza.canClaimOwner`で返す。詳細は[ルームの再接続](../../docs/social-rooms-design.md#一時的に切れたとき)。
- 明示的な退出（`leave`）はすぐ外れる。オーナーが外れるとオーナー不在になり、自動では選ばない。対戦中の着席者が外れるとその席の投了になる。
- 入室者が0人になったらすぐ閉じる（CPU は数えない）。閉じた部屋は10分残り、その間に戻った不在確定の入室者は `{ type: "gone", closed: true }` を受け取る。その秘密を `plaza.from` に付けて `POST /rooms` すると、名前・ルール・公開範囲を引き継いだ別IDの後継ルームを作る。後から戻った人は同じ後継に入り、後継は1つにまとまる。自分で退出した人と古いリンクの訪問者には後継を作らない。

## ルームのターン制限時間

- 作成時に「2分・3分・5分・無制限（OFF）」を選ぶ。初期値と既存ルームは無制限。`rules.turnSeconds` は120・180・300秒だけを受け付け、省略は無制限。再戦でも同じ設定を使う。
- ダイス・先攻後攻選択・初期手札の準備は対象外。対戦開始後、ターンごとに持ち時間を補充する。相手の選択（手札誘発・防御スキルなど）を待つ間は停止し、自分の選択中は進む。切断や再読み込みでは補充しない。
- 時間切れは投了ではなく自動ターン終了。未完了の自分の選択は「発動しない・追加コストを払わない・完了」を優先し、必須の対象や手札上限の除外は先頭の候補を自動選択する。相手の選択は代行しない。
- 締め切りと停止中の残り時間をルームと一緒に保存する。各Podは締め切りに1回だけ起き、通常と同じコマンド・CAS・履歴保存を通す。重複実行はCASで防ぐ。Podの入れ替え後は既存の定期保守で復帰する。ブラウザはサーバー時刻を基準に表示だけ更新し、毎秒の通信・Redis書き込みは行わない。

## 廃止したフリーマッチ

2026-10-29に自動マッチングの画面・待機列・検索／キャンセル処理・成立通知を削除した。`/free-match/*` は旧クライアントに410を返し、新規対戦はルームの席で行う。旧画面 `/game/battle/free/` は `/game/` へ戻す。過去の `mode: free` の対戦履歴・リプレイと、既存の2席ルームを読み取る互換性は残す。Redis上の旧待機列は更新せず、従来のTTLで自然に失効する。

## プッシュ通知（`src/push.ts`）

- ゲームの画面を見ていない間に、手番・相手の選択待ち・ルームへの入室・フレンド申請と承認・フレンドの募集を Web Push で知らせる。表示は `public/sw.js`、文言は `src/push-notices.ts`。
- 送るのはこのサーバーだけ（VAPID 秘密鍵はクラスタの Secret）。`VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` がなければ何も送らず、`/push/key` が `null` を返すのでゲーム側にベルも出ない。
- 通知先はログインしたプレイヤーごとに最大8台、最後の登録から60日。ブラウザは訪問ごとに登録し直し、サーバーの鍵が変わっていれば購読し直す。404/410 が返った通知先は消す。通知先の URL はブラウザのプッシュサービス（FCM・Apple・Mozilla・Windows）だけを受け付ける。
- 席のブラウザは、ページが隠れた・戻ったときに `{ type: "away", away }` を送る（view に `reportsAway` があるときだけ）。席の接続がないか隠れているときだけ通知する。スマホでは画面を消す・別アプリに切り替えると隠れる。
- iPhone・iPad はホーム画面に追加したアプリだけが通知を受け取れる。それ以外のSafariでベルを押すと追加をすすめる。

## Redis の使い方（`src/backend.ts`）

```
pplale:room:{id}        hash    json（ルーム全体）, v（バージョン）, st（状態）。最後の変更から ROOM_IDLE_HOURS で消える
pplale:on:{id}:{spot}   zset    席（0, 1）、観戦者（2）、プラザの入室者（m）の開いている接続。スコアは「更新されなければ消える時刻」
pplale:claim:{key}      string  最初に取った1台だけが処理する印（CPU の1手）
pplale:pod:{pod}        string  その Pod の接続数。Pod が止まると消える
pplale:totals           hash    累計（作ったルーム、始まった対戦、終わった対戦、操作）
pplale:rooms            channel ルームが変わったことを Pod どうしで知らせる
pplale:push:sub:{uid}   hash    通知先（endpoint → 購読の json）。最後の登録から60日で消える
pplale:push:away:{id}:{seat}  string  その席のページが隠れている。ROOM_IDLE_HOURS で消える
pplale:push:once:{key}  string  同じ通知を二度送らないための印
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
- `latency`：そのPodの直近256成功コマンドの段階別時間（ms、p50/p95/最大）。`read` / `store` は履歴保存の待ちも含む。ネットワーク往復時間ではない。詳しい範囲・比較結果・再測定手順は [応答改善の計測記録](../../docs/performance/game-interaction-performance-results.md)。
- 名前・デッキ・ルームIDなど、個々のルームの中身は出さない。数は最大5秒前のもの。

Redis を直接見るとき（名前空間 `pplale-room-server`）:

```
kubectl exec -n pplale-room-server sts/pplale-room-server-redis -- redis-cli --scan --pattern 'pplale:room:*'
kubectl exec -n pplale-room-server sts/pplale-room-server-redis -- redis-cli hgetall pplale:totals
```

ログは標準出力（起動時の1行と、想定外のエラー）。`kubectl logs` で見る。

## 設定

環境変数。意味とデフォルトは `helm/pplale-room-server/values.yaml` を参照。

`PORT` `REDIS_URL` `ALLOWED_ORIGINS` `TRUST_PROXY` `REQUESTS_PER_HOUR` `ROOMS_PER_HOUR` `LOBBY_GRACE_MINUTES` `ABANDON_MINUTES` `MAX_ROOMS` `ROOM_IDLE_HOURS` `BEAT_SECONDS` `APP_VERSION` `CARD_DATA_DIR` `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT`

Redis に入るのは、ルームのルール、両者の名前・デッキ・トークンのハッシュ、進行中の対戦の完全な状態。送信元のアドレスは保存しない。

## 手元で動かす

Node が TypeScript をそのまま実行するので、ビルドは要らない。ゲームと一緒に試すだけなら、リポジトリのルートで `pnpm run dev:rooms`（このサーバーを :8099 で起動し、つないだ `pnpm run dev` を :3000 で起動する）。個別に動かすときは次のとおり。

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
起動時のルーム表示・機能の入口・旧フリーマッチURLの転送は `e2e/launchpad-navigation.spec.mjs`、旧APIの410応答は `tests/retired-matchmaking.test.ts` で確認する。

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
- **プラザ**：上の「在室と閉鎖」。以下の2人用ルームの規則は使わない。
- **それ以外**：最後の変更から `ROOM_IDLE_HOURS`（12時間）で消える。解散したルームは10分残してから消す（最後のプレイヤーに解散を伝えるため）。
- Pod はそれぞれ `BEAT_SECONDS` ごとに全ルームを見て判断する（同時に見ても compare-and-set なので二重には効かない）。

ルームの数の上限は `MAX_ROOMS`（500）。1つの送信元が作れるのは1時間に `ROOMS_PER_HOUR`（30、Pod ごと）まで。ゲームを開くたびにルームを作るため、同じ回線の家族でも足りる回数にしている。開かないルームは10分（プラザは2分）で消えるため、1人が場を埋めることはできない。

`/stats` のルームの数や接続数は運用のためのもので、ゲームの画面には出さない（「稼働中 / つながらない」だけを出す）。

## 知っておくこと

- **Pod の入れ替えでは対戦は切れない。** 新しい Pod が受けられるようになってから古い Pod を止め、止まる Pod につながっていたブラウザは1秒ほどで別の Pod につなぎ直す。その間、画面に「再接続しています」と出る。
- **Redis は1台。** Redis が止まっている間はルームマッチが使えない（`/readyz` が 503 になり、つなぎ直しを待つ）。データはボリュームに毎秒書いているので、Redis が戻れば続きから遊べる。チャートの Redis の代わりに `redis.url` で別の Redis を指せる。
- **エンジンやカードが変わる入れ替えでは、進行中の対戦が続けられないことがある。** 保存してあるのは対戦の状態そのものなので、状態の形が変わると読めない。入れ替えの途中は新旧の Pod が同じルームを扱う。
- **Web アプリとサーバーのバージョンがずれている間**（Vercel と自宅クラスタは別々に入れ替わる）、新しいカードやルールの見え方が食い違うことがある。対戦を進めるのは常にサーバーの側。
- **観戦者には両方の手札が見える。** 観戦を許可したルームでは、対戦している本人が別のブラウザで観戦すれば相手の手札を見られる。防ぐ仕組みはなく、観戦の可否と人数を2人に見せているだけ。既定は観戦なしで、ルームを作る人が選ぶ。観戦は1ルーム30人まで。
- **ルームIDは6けたの数字。** 空いているルームには ID を当てれば入れる（2人そろえば入れない）。回数の制限で総当たりを抑えているだけなので、知らない人に入られて困る用途には向かない。
- **切断した相手を待つ時間に上限はない。** 相手の接続が切れたことは画面に出る。戻らないときは自分が投了するかルームを出る。
- 上の切断待ちはルームマッチの場合。廃止前のフリーマッチの既存ルームに限り、従来どおり切断1分で自動投了になる。


## 公開時の軽量な防御

- `TRUST_PROXY=true` は Cloudflare Tunnel の背後専用。送信元は単一の正しいIPを持つ `CF-Connecting-IP` から読み、ユーザーが書き足せる `X-Forwarded-For` は使わない。直接公開・ローカル起動では `TRUST_PROXY=false` とする。
- WebSocketはPod全体2,048接続、同じ送信元128接続、同じ送信元からの接続開始120回/分、同じ席4タブまで。通常の再接続や同じ回線での対戦に余裕を持たせている（Podごとの上限）。
- 各接続は瞬間30メッセージまで許し、毎秒10件ぶん回復する。処理待ちは各接続8件・Pod全体128件まで。送信待ちが256KiBを超えた接続も切る。通常操作に待ち時間は加えない。
- 重複helloは拒否し、1接続を複数の参加者として登録させない。HTTP入力は16KiB・10秒までで、超過時は読み取りを止めてエラーを返す。
- Helmの `networkPolicy` は、Cloudflare公開時の入口を実際のトンネルPodに限定する。出口はDNS、同梱Redis、履歴RPC、公開HTTPS（Firebase認証鍵取得）だけ。内部DBや自宅LANへの一般アクセスは許可しない。CNIによるNetworkPolicyの実施が必要。
- 別のIngressや外部Redisを使う場合は、信頼するプロキシと `networkPolicy.extraIngress` / `extraEgress` をその構成に合わせる。HTTPSの宛先ドメイン制限や、世界中から分散して来る攻撃への完全な防御ではない。
