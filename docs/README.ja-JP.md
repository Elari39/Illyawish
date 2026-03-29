# Illyawish 日本語ガイド

Illyawish は、Go バックエンドと React/Vite フロントエンドで構成されたローカル AI チャットワークスペースです。この文書は日本語の主入口として、ローカル開発、Docker 起動、1Panel 配備、および 1Panel 環境での 2 つの代表的な起動方法をまとめています。

## 1. プロジェクト構成と実行ルール

- フロントエンドの公開入口は既定で `http://localhost:10170`
- バックエンドは内部ポート `5721` のみで待ち受け
- ブラウザは常にフロントエンド入口へアクセスし、`/api` は内部でバックエンドへプロキシされる
- 永続データはプロジェクトルートの `data/` に保存される

主要な実行データ：

- `data/app.json`: アプリ設定と自動生成された秘密情報
- `data/aichat.db`: SQLite データベース
- `data/uploads/`: アップロードファイル格納先

初回起動後、バックエンドがこれらを自動生成します。

## 2. 機能概要

- セッションベース認証と初回ユーザー初期化
- SSE によるストリーミング応答
- SQLite による会話と設定の永続化
- OpenAI 互換エンドポイント向け Provider プリセット管理
- 画像 / 添付ファイルのアップロードと認証付き配信
- 会話のアーカイブ、ピン留め、エクスポート、再試行、再生成、編集

## 3. 前提条件

ローカル開発には以下が必要です。

- Go
- Node.js
- `pnpm`

Docker / サーバー配備には以下が必要です。

- Docker
- Docker Compose
- `docker` と `docker compose` を実行できる権限

1Panel を使う場合はさらに以下が必要です。

- インターネット接続可能な Linux サーバー
- 1Panel がインストール済み、または公式インストーラーを実行できること
- ドメイン運用をする場合は DNS 解決の準備

## 4. ローカル開発

バックエンド起動：

```bash
cd backend
go run ./cmd/server
```

フロントエンド起動：

```bash
cd frontend
pnpm install
pnpm dev
```

開発時の既定値：

- フロントエンド: `http://localhost:10170`
- バックエンド: `http://localhost:5721`
- Vite は相対 `/api` リクエストを `http://localhost:5721` にプロキシする

古いローカルデータから更新する場合で、既存の `data/aichat.db` に conversation UUID 対応がないときは、`data/aichat.db` だけ削除してバックエンドを再起動してください。`data/app.json` と `data/uploads/` は残します。

## 5. ローカルまたはサーバーで Docker Compose を直接使って起動

最も手早く動かしたい場合は、ローカルでもリモートサーバーでも、同梱の Compose ファイルをそのまま使えます。

コード取得：

```bash
git clone https://github.com/Elari39/Illyawish.git
cd Illyawish
```

起動：

```bash
docker compose up -d --build
```

アクセス先：

```text
http://localhost:10170
```

リモートサーバーで直接起動する場合は、`localhost` をサーバー IP または後段のリバースプロキシ用ドメインに読み替えてください。

よく使うコマンド：

```bash
docker compose ps
docker compose logs -f
docker compose down
docker compose up -d --build
```

ヘルスチェック：

```bash
curl http://127.0.0.1:10170/api/health
```

`{"ok":true}` が返れば、フロントエンドとバックエンドの経路は正常です。

## 6. 1Panel 配備の概要

このプロジェクトは 1Panel と相性が良いですが、まず実行モデルを理解してください。

- `frontend` がホストの `10170` を公開する
- `backend` は Docker 内部の `5721` のみを使う
- 1Panel の Website 機能やブラウザの入口は常にフロントエンドを向ける
- HTTPS を 1Panel 側で終端する場合、リバースプロキシ先は常に `http://127.0.0.1:10170`

バックエンドの `5721` を公開インターネットへ露出してはいけません。

まだ 1Panel を入れていない場合は、公式オンラインインストール例を利用できます。

```bash
bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"
```

導入後は `1pctl user-info` でパネルのアドレスを確認できます。

## 7. 1Panel の 2 つの起動方式

### 7.1 編成モード

これは 1Panel の一般的な運用に近い方法で、Compose スタックのライフサイクルを 1Panel に管理させます。

推奨ディレクトリ：

```bash
mkdir -p /opt/illyawish
cd /opt/illyawish
git clone https://github.com/Elari39/Illyawish.git .
```

その後、1Panel で以下を実行します。

1. `容器 -> 編排` を開く
2. `作成` をクリック
3. `パス` を選択
4. `/opt/illyawish/docker-compose.yml` を指定
5. 保存して起動

初回起動後の確認事項：

- `frontend` が起動し `10170` を公開している
- `backend` が起動しているがホストへは公開されていない
- プロジェクトルートに `data/app.json`、`data/aichat.db`、`data/uploads/` が生成されている

ドメインと HTTPS を設定する場合：

1. `Website -> Create Website` を開く
2. `Reverse Proxy` を選ぶ
3. ドメインを入力
4. プロキシ先に `http://127.0.0.1:10170` を設定
5. 証明書を発行またはアップロードして HTTPS を有効化

ここでプロキシ先はフロントエンド入口でなければならず、`5721` に向けてはいけません。

### 7.2 Git クローン直接起動モード

これは SSH、Git、shell でサーバー運用するほうが馴染みやすい場合に向いています。1Panel にコンテナ編成そのものは任せません。

サーバー上で実行：

```bash
mkdir -p /opt/illyawish
cd /opt/illyawish
git clone https://github.com/Elari39/Illyawish.git .
docker compose up -d --build
```

更新：

```bash
cd /opt/illyawish
git pull
docker compose up -d --build
```

このモードでも、1Panel の Website 機能でリバースプロキシと HTTPS を構成することは可能です。ただし同じサービスを `容器 -> 編排` にも重複登録して管理してはいけません。

## 8. リバースプロキシと HTTPS の注意点

1Panel Website など、信頼できる HTTPS リバースプロキシが外部 HTTPS を内部 HTTP に変換して本プロジェクトへ転送する場合、初回起動後に `data/app.json` を編集します。

```json
{
  "trustProxyHeadersForSecureCookies": true
}
```

これはバックエンドが `X-Forwarded-Proto` / `X-Forwarded-Ssl` を信頼し、Session Cookie に `Secure` を付けるべきか正しく判断するためです。

次のケースでは `false` のままにしてください。

- `http://localhost:10170` へ直接アクセスするローカル利用
- 信頼できるリバースプロキシを伴わない単純な HTTP 利用

## 9. 設定と永続化

実行時データはすべてプロジェクトルートの `data/` に入るため、ローカル Docker、サーバー直接起動、1Panel 編成モードのどれでも、配置ディレクトリはできるだけ固定にしてください。例：

```text
/opt/illyawish
```

配置先を変える場合は、`./data` を含めてプロジェクト全体を一緒に移動してください。

任意設定例：

```json
{
  "openAIBaseURL": "https://api.openai.com/v1",
  "openAIApiKey": "sk-...",
  "model": "gpt-4.1-mini",
  "bootstrapUsername": "admin",
  "bootstrapPassword": "change-me"
}
```

これらが空でも、利用者はフロントエンド UI から provider プリセットを追加できます。

## 10. 更新・ロールバック・トラブルシュート

更新の基本方針：

- 編成モード: サーバー側でコードを更新し、起動停止やログ確認は 1Panel を使う
- Git クローン直接起動モード: SSH で `git pull` と `docker compose up -d --build` を実行する

ロールバックの基本：

- 戻したい Git コミットへ移動する
- `docker compose up -d --build` を再実行する
- データ移行や初期化が目的でない限り `data/` は削除しない

確認コマンド：

```bash
docker compose ps
docker compose logs -f
curl http://127.0.0.1:10170/api/health
```

よくある問題：

1. ドメインで `502` または `504` になる

多くはリバースプロキシ先の誤りです。正しい値は `http://127.0.0.1:10170` です。

2. 画面は開くが API が失敗する

フロントエンド入口を迂回しているか、誤って `5721` に向けています。

3. 再構築後に会話履歴が消えた

プロジェクト配置先の変更、または `./data:/data` に対応するホスト側データの不一致が疑われます。

4. バックエンドポートが公開されている

どこかで `5721` を誤って外部公開しています。すぐに閉じてください。

5. どの 1Panel 方式を選ぶべきか分からない

ライフサイクルを 1Panel 上で可視化したいなら「編成モード」、SSH と Git 中心で運用したいなら「Git クローン直接起動モード」を選びます。

## 11. 検証コマンド

- バックエンドテスト: `cd backend && GOCACHE=/tmp/go-build go test ./...`
- フロントエンド lint: `cd frontend && pnpm lint`
- フロントエンドテスト: `cd frontend && pnpm test:run`
- フロントエンドビルド: `cd frontend && pnpm build`
- Compose 構成確認: `docker compose config`

## 12. 関連入口

- English: [`../README.md`](../README.md)
- 中文: [`README.zh-CN.md`](README.zh-CN.md)
- 旧 1Panel 互換入口: [`1panel-deploy.md`](1panel-deploy.md)
