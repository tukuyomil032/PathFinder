set shell := ["zsh", "-cu"]

dev:
  bun run dev

typecheck:
  bun run typecheck

test:
  bun run test

lint:
  bun run lint

format:
  bun run format

check:
  bun run check

hooks-install:
  bunx lefthook install

precommit:
  bunx lefthook run pre-commit

pm2-start:
  pm2 start bun --name dlsite-rj-preview-bot -- run src/bot/index.ts

pm2-status:
  pm2 status

pm2-logs:
  pm2 logs dlsite-rj-preview-bot
