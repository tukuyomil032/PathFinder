# DLSite RJ Preview Bot Requirements

## 1. Overview

- 目的: Discord メッセージ内の `RJ` コードを自動検出し、DLSite 作品情報を Embed 形式で返すセルフホスト Bot の v1 要件を定義する。
- 想定利用者: 自宅 PC 上で Bot を運用する個人または少人数の身内サーバー管理者。
- 実行環境: `macOS` 上で `Bun + TypeScript` を用いて実装し、`pm2` で常駐運用する。
- データ取得方式: DLSite 公式 API は使わず、作品ページの HTML を取得し `cheerio` で解析する。

## 2. Goals

- Discord 上の会話導線を崩さずに DLSite 作品の概要を即時確認できる。
- 成人向け作品の露出をチャンネル NSFW 設定に応じて制御できる。
- 取得失敗や DOM 変化時にも、Bot が沈黙せず簡潔な失敗応答を返せる。
- 短時間のメモリキャッシュで同一作品への短時間アクセス負荷を抑制できる。

## 3. Scope

### In Scope

- Discord メッセージ本文から `RJxxxxxx` 形式のコードを自動抽出する。
- 1 メッセージに複数コードが含まれても先頭 1 件のみ処理する。
- DLSite 作品ページから作品概要を取得し、Discord Embed に整形して返信する。
- NSFW チャンネルでは詳細表示、非 NSFW チャンネルでは成人向け作品の詳細を抑制する。
- 作品情報の短時間メモリキャッシュを持つ。
- `.env` を正本として設定を注入し、起動時に厳格検証する。
- `pm2` を正式な常駐運用手段として文書化する。

### Out of Scope

- 公式 API 連携
- 永続 DB 導入
- サーバーごとの個別設定保存
- Slash Command や管理 UI
- 多言語対応
- 画像の再ホストやファイル添付
- 2 件目以降の RJ コード同時展開

## 4. Functional Requirements

### 4.1 Message Detection

- Bot はメッセージ作成イベントを購読する。
- 抽出対象はメッセージ本文のみとし、添付・埋め込み先までは v1 では解析しない。
- 検出は大文字小文字を区別せず行い、内部では正規化して大文字 `RJ` に揃える。
- メッセージ中に有効な RJ コードがない場合は何もしない。

### 4.2 Work Fetching

- 先頭の RJ コードを使って DLSite 作品ページ URL を組み立てる。
- HTTP 取得時は専用 `User-Agent` を付与する。
- ネットワーク失敗、404、想定外レスポンス時は失敗応答へフォールバックする。

### 4.3 Parsing

- HTML から以下の主要情報を抽出する。
  - `id`
  - `title`
  - `url`
  - `makerName`
  - `price`
  - `salePrice`
  - `ageCategory`
  - `releaseDate`
  - `rating`
  - `thumbnailUrl`
  - `tags`
  - `isAdult`
- 余裕があれば以下の任意項目も抽出対象とする。
  - `author`
  - `scenario`
  - `illustration`
  - `voiceActors`
  - `fileFormat`
  - `fileSize`
- 任意項目が欠落していても失敗扱いにしない。
- 必須項目の抽出不能時は構造変化を検知した失敗として扱う。

### 4.4 Reply Formatting

- Discord 返信は Embed を基本とする。
- 非 NSFW チャンネルで成人向け作品を検出した場合:
  - タイトル、作品 ID、作品 URL 程度の最小情報に抑える。
  - サムネイル、タグ、出演情報など刺激の強い詳細は表示しない。
- NSFW チャンネルでは通常の詳細 Embed を返す。
- 取得または解析失敗時は、原因を過剰に露出せず簡潔なエラーメッセージを返す。

### 4.5 Cache

- キャッシュ単位は RJ コードとする。
- TTL は `.env` の `CACHE_TTL_MS` で制御する。
- TTL 内の同一コード問い合わせは再取得せずキャッシュを返す。
- TTL 経過後は自動失効扱いとする。

## 5. Non-Functional Requirements

- 実装言語: `TypeScript`
- ランタイム: `Bun`
- Discord ライブラリ: `discord.js`
- HTML 解析: `cheerio`
- 設定検証: `zod`
- テスト: `vitest`
- フォーマット / lint: `biome`
- Git hook: `lefthook`

## 6. Required Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | Yes | Discord Bot トークン |
| `DISCORD_CLIENT_ID` | No | 将来のコマンド拡張用の控え |
| `CACHE_TTL_MS` | Yes | メモリキャッシュ TTL |
| `DLSITE_USER_AGENT` | Yes | DLSite 取得用 User-Agent |
| `NSFW_STRICT_MODE` | Yes | 成人向け表示制御の厳格化フラグ |

## 7. Use Cases

### 正常系

1. ユーザーが通常メッセージに `RJ012345` を含めて投稿する。
2. Bot が先頭コードを抽出し、DLSite 作品ページを取得する。
3. Bot が作品情報を解析し、Discord Embed に整形する。
4. チャンネル NSFW 状態に応じた内容で返信する。

### 異常系

1. RJ コードはあるがページ取得に失敗する。
2. Bot は短い失敗メッセージを返す。
3. ログには取得失敗の詳細を残すが、ユーザー向け応答は簡潔に保つ。

1. DLSite DOM が変化し必須項目を抽出できない。
2. Bot は解析失敗として扱い、簡潔な失敗メッセージを返す。
3. テスト fixture 更新または parser 修正の対象とする。

1. 1 メッセージ内に複数の RJ コードがある。
2. 先頭 1 件のみ処理し、残りは無視する。

## 8. Failure Response Policy

- ユーザー向け失敗文言は短く固定する。
- 内部例外やスタックトレースは Discord に出さない。
- 再試行を促す程度に留め、詳細調査は運用者ログで行う。

## 9. Risks And Constraints

- DLSite の DOM 変更により parser が壊れる可能性が高い。
- HTML スクレイピングは利用規約や robots 的な制約確認が必要。
- 短時間に大量取得するとレートやアクセス負荷の問題を招く。
- 成人向け作品の露出制御を誤るとサーバー運用上のリスクがある。
- 自宅 PC 常駐前提のため、回線断やスリープ設定の影響を受ける。

## 10. Acceptance Criteria

- `RJ` コード検出から Discord 返信までの処理境界が明確である。
- 成人向け表示制御の挙動が NSFW / 非 NSFW で明示されている。
- 失敗時応答、複数 RJ コード時の扱い、キャッシュ方針が固定されている。
- 運用上の外部依存と主要リスクが文書内で明示されている。

## 11. Agent Operation Notes

- 本要件を実装へ引き渡す際のエージェント運用基準は `~/.codex/AGENTS.md` を参照する
- 参照スキルは `.codex/skills/<skill>/SKILL.md` にローカル配置したものを優先する
- ローカル配置が未整備の場合のみ `~/.claude/skills/<skill>/` をコピー元として補充する
