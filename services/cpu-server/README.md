# @pplale/cpu-server

「さいきょう」の頭脳を育てるサーバー。人との対戦記録を集めて学習し続け、いちばん新しいモデルをゲームに配る。

- 思考はブラウザのまま（Web Worker）。サーバーが配るのは重み（約20KB）だけなので、1手ごとの通信も、サーバー側の思考の負荷もない。サーバーが落ちていても、アプリに入っているモデルで遊べる。
- Web アプリに `NEXT_PUBLIC_CPU_SERVER_URL` を設定したときだけ有効になる。設定しなければ同意の画面も出ず、何も送られない。

## 流れ

1. プレイヤーが初めて「さいきょう」と対戦するとき、対戦記録を学習に使うことへの同意を求める（ブラウザごとに1回。ログイン不要。準備画面からいつでもやめられる）。
2. 対戦開始時に `GET /model` でモデルを受け取り、「さいきょう」はそれで考える。
3. 決着したら `POST /reports` で記録を送る。中身は **両者のデッキのカード・シャッフルの種・打った手** だけ。名前・デッキ名・アカウントは送らない。勝ち負けの両方を送る（負けた試合だけでは勝率を学習できない）。
4. サーバーは記録をエンジンで最初から再生し、実際に成立する対戦だけを保存する。勝者は再生の結果から決める。
5. 新しい記録が溜まると学習する：「つよい」の自己対戦（約30万局面）に人との対戦の局面を重み付きで混ぜて学習し、できたモデルをイメージ内蔵のモデルと対戦させる。**負け越さなかったときだけ**配る。

## API

| | |
| --- | --- |
| `GET /model` | `{ version, model }`。5分キャッシュ、ETag つき |
| `POST /reports` | `{ level: "master", model, seed, decks, commands }`。新規 201 / 既知 200 / 不正 400 / 送りすぎ 429 |
| `GET /stats` | 記録の数、モデルのバージョンごとの対人成績（CPUの勝ち数）、学習の履歴 |
| `GET /healthz` | |

`/stats` の `results` が、人に対する本当の強さの物差しになる（これまでの数字はすべてCPU同士の比較）。

## データ（`DATA_DIR`、クラスタではボリューム）

```
reports/<日付>.jsonl   検証済みの対戦記録（1行1試合）。送信元のアドレスや時刻は持たない
models/<version>.json  配ったモデル。current.json がいま配っているもの
selfplay/…bin          自己対戦の局面。イメージのバージョンごとに1回集める
training.json          学習の履歴
```

## 設定

環境変数。意味とデフォルトは `helm/pplale-cpu-server/values.yaml` を参照。

`PORT` `DATA_DIR` `ALLOWED_ORIGINS` `TRUST_PROXY` `REPORTS_PER_HOUR` `TRAINING` `TRAIN_MIN_NEW_REPORTS` `TRAIN_INTERVAL_MINUTES` `TRAIN_THREADS` `SELFPLAY_GAMES` `HUMAN_WEIGHT` `GATE_PAIRS` `GATE_MIN_RATE` `APP_VERSION` `CARD_DATA_DIR`

## 手元で動かす

Node がTypeScriptをそのまま実行するので、ビルドは要らない。

```
npm run start --workspace=@pplale/cpu-server          # http://localhost:8080
npm run train --workspace=@pplale/cpu-server          # 学習を1回だけ実行
npm run test:cpu-server                               # 最後のテストは実際に対戦するので30秒ほど
NEXT_PUBLIC_CPU_SERVER_URL=http://localhost:8080 npm run dev   # ゲームをつなぐ
```

コンテナ（リポジトリのルートから）:

```
docker build -f services/cpu-server/Dockerfile -t pplale-cpu-server .
docker run --rm -p 8080:8080 -v pplale-cpu-data:/data pplale-cpu-server
```

## デプロイ

`pplale-cms` と同じ形。

1. main に入ると `.github/workflows/cpu-server-image.yml` がバージョンを採番し（git タグ `cpu-server-vX.Y.Z`）、`ghcr.io/ieyoukan/pplale-cpu-server:X.Y.Z` を push する。
2. `home-manifests` に Argo CD の Application を足す（`helm/pplale-cpu-server` を参照）:

   ```yaml
   apiVersion: argoproj.io/v1alpha1
   kind: Application
   metadata:
     name: pplale-cpu-server
     namespace: argocd
   spec:
     project: default
     source:
       repoURL: https://github.com/ieyoukan/PPLALE-web.git
       targetRevision: main
       path: helm/pplale-cpu-server
       helm:
         releaseName: pplale-cpu-server
         valuesObject:
           ingress:
             enabled: true
             className: cloudflare
             hosts:
               - host: pplale-cpu.youkan.uk
                 paths:
                   - path: /
                     pathType: Prefix
           persistence:
             storageClass: proxmox-data
     destination:
       server: https://kubernetes.default.svc
       namespace: pplale-cpu-server
     syncPolicy:
       automated:
         prune: true
         selfHeal: true
       syncOptions:
         - CreateNamespace=true
   ```

3. `apps/argocd/image-updater.yaml` の `applicationRefs` に足す:

   ```yaml
   - namePattern: pplale-cpu-server
     images:
       - alias: pplale-cpu-server
         imageName: ghcr.io/ieyoukan/pplale-cpu-server
         commonUpdateSettings:
           updateStrategy: semver
           allowTags: regexp:^[0-9]+\.[0-9]+\.[0-9]+$
         manifestTargets:
           helm:
             tag: image.tag
   ```

4. ghcr のパッケージを公開にする（または `imagePullSecrets` を設定する）。
5. Web アプリ（Vercel）の環境変数に `NEXT_PUBLIC_CPU_SERVER_URL=https://pplale-cpu.youkan.uk` を設定して再デプロイする。ここで初めて同意の画面と送信が有効になる。

## 知っておくこと

- **学習の効果はまだ測れていない。** 人との対戦を混ぜると強くなるかは、記録が集まってから `/stats` の対人成績で確かめる。配る前の対戦は「弱くならないこと」の確認で、強くなったことの証明ではない。
- **だれでも送れる。** 匿名なので、ルール上成立するだけのでたらめな対戦も受け取ってしまう。再生による検証・送信数の制限・配る前の対戦で被害を抑えているが、CPUがわざと負けるような記録までは見抜けない。
- **エンジンやカードが変わると古い記録は再生できなくなる。** 学習のときに再生し直し、同じ結果にならない記録は使わない。Web アプリとサーバーのバージョンがずれている間は、送られた記録が「再生できない」として捨てられることがある。
- **学習は重い。** 自己対戦の収集（イメージのバージョンごとに1回、2スレッドで15分ほど）と、配る前の対戦（毎回、2スレッドで1時間ほど）の間は `training.threads` ぶんのCPUを使い切る。
