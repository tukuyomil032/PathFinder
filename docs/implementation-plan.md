# DLSite/FANZA Preview Bot Implementation Notes

## 1. Purpose

本書は将来のゼロから実装する計画書ではなく、現行実装の handoff / maintenance 向けメモである。保守時は、現状の責務分割とテスト境界を崩さないことを優先する。

## 2. Operational Preconditions

- エージェント運用の全体基準は `~/.codex/AGENTS.md` を参照する。
- 実装・保守前に、参照スキルの必要最小セットが `.codex/skills/<skill>/SKILL.md` にローカル配置済みであること。
- 初回ローカル配置対象は `brainstorming`, `writing-plans`, `executing-plans`, `systematic-debugging`, `requesting-code-review`, `empirical-prompt-tuning`。

## 3. Current Flow

1. `src/presentation/discord/handle-message-create.ts` がメッセージ本文から先頭の `WorkReference` を選ぶ。
2. `src/domain/rj/resolve-work.ts` が `store` に応じて fetch / probe / parse を切り替える。
3. DLSite は canonical URL を組み立てて fetch し、DMM family は URL 取得または bare probe を行う。
4. `parseWork` が `WorkPreview` に正規化する。
5. キャッシュへ保存し、`build-preview-message.ts` が NSFW 制御込みで返信 payload を組み立てる。

## 4. File Responsibilities

| Path | Responsibility |
| --- | --- |
| `src/bot/index.ts` | エントリポイント、Discord Client 起動 |
| `src/config/env.ts` | `.env` 読み込みと `zod` 検証 |
| `src/domain/rj/extract-work-references.ts` | 作品参照抽出と正規化 |
| `src/domain/rj/extract-rj-codes.ts` | DLSite ID だけを返す後方互換 wrapper |
| `src/domain/rj/types.ts` | `WorkReference`, `FetchedWorkPage`, `WorkPreview` などの共通型 |
| `src/domain/rj/cache.ts` | `WorkReference(store + id)` 前提の TTL 付きメモリキャッシュ |
| `src/domain/rj/resolve-work.ts` | store ごとの fetch / probe / parse 解決 |
| `src/integrations/dlsite/fetch-work-page.ts` | DLSite URL 生成と HTML 取得 |
| `src/integrations/dlsite/parse-work.ts` | DLSite HTML から作品情報を抽出 |
| `src/integrations/dmm/fetch-work-page.ts` | DMM family URL 解決、probe、年齢確認付き HTML 取得 |
| `src/integrations/dmm/parse-work.ts` | FANZA同人 / DMM TV / FANZA GAMES / FANZA BOOKS 解析 |
| `src/presentation/discord/build-preview-message.ts` | Embed / 失敗応答組み立て |
| `src/presentation/discord/handle-message-create.ts` | 薄い Discord ハンドラ |
| `tests/fixtures/*.html` | parser / fetch fixture |
| `tests/**/*.test.ts` | unit / integration test |

## 5. Supported Inputs

### DLSite

- bare ID: `RJ012345`, `BJ02519460`, `VJ01004728`
- 対応 URL

### DMM family

- FANZA同人 bare ID: `d_123456`, `d123456`
- DMM TV bare ID: `mide00924`
- FANZA GAMES bare slug: `spal_0201`
- FANZA BOOKS bare code: `b915awnmg04288`
- 明示プレフィックス: `av:<id>`, `game:<slug>`, `book:<code>`
- 各対応 URL

## 6. Current Behavior Notes

- 1 メッセージ内に複数参照があっても先頭 1 件のみ処理する。
- DLSite bare ID は prefix に応じて `maniax` / `books` / `pro` を切り替える。
- DMM family の URL 入力は query を落とさず取得する。
- FANZA同人 bare は probe 成功時だけ canonical URL に昇格する。
- FANZA同人 bare の probe が失敗した場合は通常失敗ではなく URL 誘導へ落とす。
- 非 NSFW チャンネルでは DMM family 全体を最小表示へ倒す。

## 7. Maintenance Rules

- Discord handler は薄く保ち、取得・解析・整形・失敗分岐を domain / integrations / presentation に分ける。
- DOM 変化対応時は fixture 更新と parser 修正をセットで行う。
- `process.env` の直接参照は `src/config` 以外へ広げない。
- 新しい入力系を追加する場合は `extract-work-references.ts`、`resolve-work.ts`、presentation、tests を同時に更新する。

## 8. Testing Focus

### `tests/domain/rj/extract-work-references.test.ts`

- `RJ/BJ/VJ`
- FANZA同人 `d_123456` / `d123456`
- bare DMM TV / FANZA GAMES / FANZA BOOKS
- `av:` / `game:` / `book:`
- URL と bare が混在したときの順序保証

### `tests/domain/rj/resolve-work.test.ts`

- DLSite bare / URL の canonical 解決
- DMM family bare / URL の fetch / probe
- FANZA同人 bare probe 失敗時の `fanza_url_required`

### `tests/presentation/discord/build-preview-message.test.ts`

- 通常 Embed
- 非 NSFW での抑制表示
- DMM family の非 NSFW 最小表示
- `generic` / `fanza_url_required` の失敗文言

### `tests/presentation/discord/handle-message-create.test.ts`

- 先頭 1 件処理
- cache hit / miss
- store ごとの routing
- FANZA URL 誘導の返信分岐

### `tests/presentation/discord/preview-flow.integration.test.ts`

- fetch -> parse -> cache -> reply の統合フロー
- 複数候補から先頭だけ使う挙動

### Parser / Fetch Tests

- `tests/integrations/dlsite/*.test.ts`
- `tests/integrations/fanza/*.test.ts`
- fixture DOM からの主要項目抽出
- age-check / not-found / required-field-missing の異常系

## 9. Verification Commands

保守作業後の基本確認:

```bash
bun run typecheck
bun run test
```

必要に応じて品質ゲート全体を確認:

```bash
bun run check
```

docs-only 更新では、上記に加えて `rg` による文言整合確認を主確認としてよい。

## 10. Handoff Notes

- `package.json` は最小 scripts のみ持つ。
- 補助操作は `justfile` に集約する。
- DLSite / DMM-FANZA の DOM 変化が疑われる場合は `tests/fixtures/*.html` を更新し、関連 parser テストを見直す。
- Bot の返信文面は短く保ち、詳細はログで追う。
- `NSFW_STRICT_MODE` が有効な場合は、迷ったら非表示側に倒す。
- 完了後は `.codex/skills/requesting-code-review/SKILL.md`、`.codex/skills/empirical-prompt-tuning/SKILL.md`、`/clear` の順で運用を閉じる。
