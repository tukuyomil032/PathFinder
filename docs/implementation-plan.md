# DLSite RJ Preview Bot Implementation Plan

## 1. Purpose

本書は要件定義と実装 handoff を兼ねる decision-complete な計画書である。実装者は本書の順序と責務分割に従って、最小構成で v1 を完成させる。

## 1.1 Operational Preconditions

- エージェント運用の全体基準は `~/.codex/AGENTS.md` を参照する
- 実装着手前に、参照スキルの必要最小セットが `.codex/skills/<skill>/SKILL.md` にローカル配置済みであること
- ローカル配置のコピー元は `~/.claude/skills/<skill>/` とする
- 初回ローカル配置対象は `brainstorming`, `writing-plans`, `executing-plans`, `systematic-debugging`, `requesting-code-review`, `empirical-prompt-tuning`

## 2. Implementation Order

1. Bun / TypeScript 基盤を作る
2. `Biome + Lefthook + Vitest` を整える
3. `zod` による環境変数検証を導入する
4. RJ 抽出ロジックを実装する
5. DLSite HTML 取得を実装する
6. HTML parser を実装する
7. Discord Embed formatter を実装する
8. NSFW 分岐を実装する
9. メモリキャッシュを追加する
10. `pm2` 運用手順を文書化する

## 3. File Responsibilities

| Path | Responsibility |
| --- | --- |
| `src/bot/index.ts` | エントリポイント、Discord Client 起動 |
| `src/config/env.ts` | `.env` 読み込みと `zod` 検証 |
| `src/domain/rj/extract-rj-codes.ts` | RJ コード抽出と正規化 |
| `src/domain/rj/types.ts` | `DLSiteWork` などの型定義 |
| `src/domain/rj/cache.ts` | TTL 付きメモリキャッシュ |
| `src/integrations/dlsite/fetch-work-page.ts` | DLSite HTML 取得 |
| `src/integrations/dlsite/parse-work.ts` | HTML から作品情報を抽出 |
| `src/presentation/discord/build-preview-message.ts` | Embed / 失敗応答組み立て |
| `src/presentation/discord/handle-message-create.ts` | 薄い Discord ハンドラ |
| `tests/fixtures/*.html` | parser fixture |
| `tests/**/*.test.ts` | unit test |

## 4. Acceptance Criteria By Step

### Step 1. Bun / TypeScript 基盤

- `bun init` 相当の最小構成がある
- `tsconfig.json` が存在する
- `src/` と `tests/` のディレクトリ責務が揃う

### Step 2. Tooling

- `biome`, `vitest`, `lefthook` が導入される
- pre-commit で以下が必ず走る
  - `biome format --check`
  - `biome lint`
  - `tsc --noEmit`
  - `vitest run`

### Step 3. Env Validation

- `.env` の必須項目が `zod` で検証される
- 不正値で起動が停止する

### Step 4. RJ Extraction

- 単体コードを抽出できる
- 大文字小文字混在を正規化できる
- 複数コードがあっても先頭を選べる

### Step 5-6. Fetch / Parse

- fixture HTML から必須項目を抽出できる
- 任意項目欠落でも落ちない
- DOM 変化を検知できる

### Step 7-8. Reply / NSFW

- NSFW チャンネルでは詳細 Embed を返せる
- 非 NSFW では成人向け詳細が抑制される
- 失敗時は簡潔応答になる

### Step 9. Cache

- TTL 内ヒットで再取得しない
- TTL 後に失効する

### Step 10. Operations

- `pm2` 起動、再起動、ログ確認手順が README または docs にまとまる

## 5. Recommended Patterns

### 5.1 `zod` で env を厳格検証する

```ts
import { z } from "zod";

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  CACHE_TTL_MS: z.coerce.number().int().positive(),
  DLSITE_USER_AGENT: z.string().min(1),
  NSFW_STRICT_MODE: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const env = envSchema.parse(process.env);
```

### 5.2 parser と formatter を分離する

```ts
const html = await fetchWorkPage(workId);
const work = parseWork(html, workId);
const reply = buildPreviewMessage(work, channelIsNsfw);
```

### 5.3 Discord handler を薄く保つ

```ts
export async function handleMessageCreate(message: Message) {
  const [workId] = extractRjCodes(message.content);
  if (!workId) return;

  const work = await previewService.getWork(workId);
  const payload = buildPreviewMessage(work, message.channel.nsfw ?? false);
  await message.reply(payload);
}
```

## 6. NG Patterns

- Discord handler に取得、解析、整形、返信、例外分岐を全部詰め込む
- HTML を広範囲に正規表現だけで解析する
- `process.env` を各所で直接読む
- NSFW 判定なしで常に詳細表示する
- pre-commit を通らない差分を前提に運用する

## 7. Testing Plan

### `extractRjCodes`

- `RJ / BJ / VJ` の DLSite ID を抽出できる
- 小文字や空白混在時の扱いを固定できる
- 先頭 1 件処理方針を検証できる

### `parseWork`

- fixture HTML から必須項目を抽出できる
- 任意項目欠落時も壊れない
- DOM 変化時に失敗検知できる

### `buildPreviewMessage`

- NSFW チャンネルでは詳細表示する
- 非 NSFW では抑制表示する
- 失敗時は簡潔メッセージになる

### `cache`

- TTL 内再利用
- TTL 後失効

### `tooling`

- `lefthook pre-commit` で format / lint / typecheck / test が全部走る
- `package.json` scripts と `justfile` の責務分離が守られる

## 8. Verification Commands

実装完了時の基本確認コマンド:

```bash
bunx biome format .
bunx biome lint .
bunx tsc --noEmit
bunx vitest run
```

運用確認コマンド候補:

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs dlsite-rj-preview-bot
```

## 9. Handoff Notes

- `package.json` は最小 scripts のみ持つ
- 補助操作は `justfile` に集約する
- DLSite parser は DOM 変化に弱いので fixture 更新導線を明確にする
- Bot の返信文面は最初から短く保ち、ログで詳細を追う
- `NSFW_STRICT_MODE` が有効な場合は、迷ったら非表示側に倒す
- 実装 handoff では `.codex/skills` にローカル配置したスキルを参照し、追加が必要な場合だけ `~/.claude/skills` から補充する
- 完了後は `.codex/skills/requesting-code-review/SKILL.md`、`.codex/skills/empirical-prompt-tuning/SKILL.md`、`/clear` の順で運用を閉じる

## 10. Ready-To-Implement Definition

以下を満たせば実装着手可とみなす。

- 要件、構成、責務境界が `docs/requirements.md` と `docs/architecture.md` に揃っている
- ファイル責務と実装順序が本書で固定されている
- 受け入れ条件と確認コマンドが本書で明示されている
