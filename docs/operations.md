# Runtime Operations

## Setup

1. `cp .env.example .env`
2. `.env` に `DISCORD_BOT_TOKEN`, `CACHE_TTL_MS`, `DLSITE_USER_AGENT`, `NSFW_STRICT_MODE` を設定する
3. `bun install`
4. `just hooks-install`
5. `just check`

`package.json` は最小 scripts のみを持ち、日常操作は `justfile` を優先する。

## Local Commands

- 開発起動: `bun run dev`
- 型検査: `just typecheck`
- テスト: `just test`
- 品質ゲート一括: `just check`
- pre-commit 手動実行: `just precommit`

## PM2

- 起動: `pm2 start bun --name dlsite-rj-preview-bot -- run src/bot/index.ts`
- 状態確認: `pm2 status`
- 再起動: `pm2 restart dlsite-rj-preview-bot`
- 停止: `pm2 stop dlsite-rj-preview-bot`
- ログ確認: `pm2 logs dlsite-rj-preview-bot`

## Daily Checks

1. `pm2 status` でプロセスが online か確認する
2. `pm2 logs dlsite-rj-preview-bot --lines 100` で取得失敗や parser 失敗がないか確認する
3. DLSite の DOM 変化が疑われる場合は `tests/fixtures/*.html` を更新し、`just check` を再実行する
