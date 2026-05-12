# DLSite/FANZA Preview Bot Requirements

## 1. Overview

- 目的: Discord メッセージ内の DLSite / DMM-FANZA 系作品参照を自動検出し、作品情報プレビューを返信するセルフホスト Bot の現行要件を定義する。
- 想定利用者: 自宅 PC 上で Bot を運用する個人または少人数の身内サーバー管理者。
- 実行環境: `macOS` 上で `Bun + TypeScript` を用いて実装し、`pm2` で常駐運用する。
- データ取得方式: 公式 API は使わず、DLSite / DMM-FANZA の作品ページ HTML を取得し `cheerio` で解析する。

## 2. Goals

- Discord 上の会話導線を崩さずに DLSite / FANZA 作品の概要を即時確認できる。
- 成人向け作品の露出をチャンネル NSFW 設定に応じて制御できる。
- 取得失敗や DOM 変化時にも、Bot が沈黙せず簡潔な失敗応答を返せる。
- 短時間のメモリキャッシュで同一作品への短時間アクセス負荷を抑制できる。

## 3. Scope

### In Scope

- Discord メッセージ本文から以下の入力を自動抽出する。
  - DLSite bare ID: `RJxxxxxx`, `BJxxxxxx`, `VJxxxxxx`
  - DLSite 対応 URL
  - FANZA同人 bare ID: `d_123456`, `d123456`
  - FANZA同人 / DMM TV / FANZA GAMES / FANZA BOOKS の対応 URL
  - DMM TV 明示プレフィックス: `av:<id>`
  - FANZA GAMES 明示プレフィックス: `game:<slug>`
  - FANZA BOOKS 明示プレフィックス: `book:<code>`
  - bare DMM TV ID、FANZA GAMES slug、FANZA BOOKS code
- 1 メッセージに複数の参照が含まれても先頭 1 件のみ処理する。
- 作品ページから作品概要を取得し、Discord Embed に整形して返信する。
- Slash Command から同じプレビュー処理を明示実行できる。
- NSFW チャンネルでは詳細表示、非 NSFW チャンネルでは成人向け作品の詳細を抑制する。
- 作品情報の短時間メモリキャッシュを持つ。
- `.env` を正本として設定を注入し、起動時に厳格検証する。
- `pm2` を正式な常駐運用手段として文書化する。

### Out of Scope

- 公式 API 連携
- 永続 DB 導入
- サーバーごとの個別設定保存
- 多言語対応
- 画像の再ホストやファイル添付
- 2 件目以降の同時展開

## 4. Functional Requirements

### 4.1 Message Detection

- Bot は `messageCreate` イベントを購読する。
- 抽出対象はメッセージ本文のみとし、添付・埋め込み先までは解析しない。
- DLSite bare ID は大文字小文字を区別せず検出し、内部では `RJ` / `BJ` / `VJ` の大文字へ正規化する。
- FANZA同人 bare ID は `d123456` 入力を `d_123456` へ正規化する。
- URL、bare ID、明示プレフィックスが混在する場合も、メッセージ中で最初に現れた 1 件を採用する。
- 有効な作品参照がない場合は何もしない。

### 4.2 Work Resolution And Fetching

- Bot は検出結果を `WorkReference(store + id + kind)` として扱う。
- DLSite は `RJ/BJ/VJ` から canonical URL を組み立てて取得する。
- DMM family は URL 入力をそのまま解決し、bare / prefix 入力は store ごとの probe または canonical URL へ解決する。
- FANZA同人 bare ID が probe で解決できない場合は、通常失敗ではなく URL 付き送信の誘導へフォールバックする。
- HTTP 取得時は専用 `User-Agent` を付与する。
- ネットワーク失敗、404、想定外レスポンス時は失敗応答へフォールバックする。

### 4.2.1 Slash Commands

- Bot は `interactionCreate` で Chat Input Command を購読する。
- 以下の command surface を提供する。
  - `/dlsite maniax input:<string>`
  - `/dlsite books input:<string>`
  - `/dlsite pro input:<string>`
  - `/fanza doujin input:<string>`
  - `/fanza av input:<string>`
  - `/fanza game input:<string>`
  - `/fanza book input:<string>`
  - `/help [command]`
- `input` は ID または対応 URL のみ受け付ける。
- サブコマンドと内部 `store` / surface の対応は固定する。
  - `/dlsite maniax` -> `dlsite` + `RJ`
  - `/dlsite books` -> `dlsite` + `BJ`
  - `/dlsite pro` -> `dlsite` + `VJ`
  - `/fanza doujin` -> `fanza_doujin`
  - `/fanza av` -> `dmm_tv_av`
  - `/fanza game` -> `fanza_pcgame`
  - `/fanza book` -> `fanza_books`
- 不正入力時は、そのコマンド系統に対応した短い usage を返す。
- `/help` は全体一覧、入力フォーマット、代表例、NSFW 挙動を返し、`command` 指定時は対象 command だけ詳しく返す。
- `/help` は `ephemeral`、プレビュー系 command は通常返信とする。

### 4.3 Parsing

- HTML から以下の主要情報を抽出する。
  - `store`
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
  - `parseCoverage`
  - `serviceName`
- 以下の任意項目も抽出対象とする。
  - `author`
  - `scenario`
  - `illustration`
  - `voiceActors`
  - `fileFormat`
  - `fileSize`
  - `circleOrBrandLabel`
  - `rawAttributes`
- 任意項目が欠落していても失敗扱いにしない。
- 必須項目の抽出不能時は構造変化を検知した失敗として扱う。

### 4.4 Reply Formatting

- Discord 返信は Embed を基本とする。
- 非 NSFW チャンネルで成人向け作品を検出した場合:
  - DLSite はタイトル、作品 ID、作品 URL 程度の最小情報に抑える。
  - DMM family は full / partial を問わず最小表示へ倒し、詳細を出さない。
- NSFW チャンネルでは通常の詳細 Embed を返す。
- 取得または解析失敗時は、原因を過剰に露出せず簡潔な失敗メッセージを返す。
- 失敗応答には 2 種類ある。
  - 通常失敗: 再試行を促しつつ、`d123456 / av:mide00924 / game:spal_0201 / book:b915awnmg04288` などの FANZA 入力例を含める。
  - `fanza_url_required`: FANZA同人 bare 解決失敗時に、URL 付き送信を明示的に案内する。

### 4.5 Cache

- キャッシュ単位は `WorkReference(store + id)` とする。
- TTL は `.env` の `CACHE_TTL_MS` で制御する。
- TTL 内の同一参照問い合わせは再取得せずキャッシュを返す。
- DMM family 間で ID 衝突しても store が異なれば別キャッシュとして扱う。
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
| `DISCORD_GUILD_ID` | No | Slash Command を guild 登録する対象サーバー ID |
| `CACHE_TTL_MS` | Yes | メモリキャッシュ TTL |
| `DLSITE_USER_AGENT` | Yes | DLSite 取得用 User-Agent |
| `NSFW_STRICT_MODE` | Yes | 成人向け表示制御の厳格化フラグ |

## 7. Use Cases

### 正常系

1. ユーザーが `RJ012345` または対応 URL を投稿する。
2. Bot が先頭参照を抽出し、DLSite 作品ページを取得する。
3. Bot が作品情報を解析し、Discord Embed に整形する。
4. チャンネル NSFW 状態に応じた内容で返信する。

1. ユーザーが `av:mide00924`、`game:spal_0201`、`book:b915awnmg04288`、または対応 URL を投稿する。
2. Bot が store と ID を解決し、DMM family の作品ページを取得する。
3. Bot が作品情報を解析し、Discord Embed に整形する。
4. 非 NSFW チャンネルでは最小情報のみ返信する。

1. ユーザーが `/dlsite books input:BJ02519460` を実行する。
2. Bot が `WorkReference` を明示生成し、メッセージ自動検出と同じプレビュー経路で作品情報を返す。

1. ユーザーが `/help fanza` を実行する。
2. Bot が FANZA 系サブコマンド、入力形式、代表例、NSFW 挙動を `ephemeral` で返す。

### 異常系

1. 作品参照はあるがページ取得に失敗する。
2. Bot は短い失敗メッセージを返す。
3. ログには取得失敗の詳細を残すが、ユーザー向け応答は簡潔に保つ。

1. DLSite または DMM-FANZA 側の DOM が変化し必須項目を抽出できない。
2. Bot は解析失敗として扱い、簡潔な失敗メッセージを返す。
3. テスト fixture 更新または parser 修正の対象とする。

1. FANZA同人 bare ID は検出できたが canonical URL を解決できない。
2. Bot は `fanza_url_required` として、URL 付き送信を案内する。

1. 1 メッセージ内に複数の参照がある。
2. 先頭 1 件のみ処理し、残りは無視する。

## 8. Failure Response Policy

- ユーザー向け失敗文言は短く固定する。
- 内部例外やスタックトレースは Discord に出さない。
- FANZA 入力での失敗時も、通常失敗と URL 誘導失敗を出し分ける。
- 詳細調査は運用者ログで行う。

## 9. Risks And Constraints

- DLSite / DMM-FANZA 側の DOM 変更により parser が壊れる可能性が高い。
- HTML スクレイピングは利用規約や robots 的な制約確認が必要。
- 短時間に大量取得するとレートやアクセス負荷の問題を招く。
- 成人向け作品の露出制御を誤るとサーバー運用上のリスクがある。
- 自宅 PC 常駐前提のため、回線断やスリープ設定の影響を受ける。

## 10. Acceptance Criteria

- DLSite 系入力と FANZA 系入力の判別ルールが明示されている。
- `RJ/BJ/VJ`、`d_123456` / `d123456`、`av:` / `game:` / `book:`、各対応 URL の扱いが定義されている。
- 成人向け表示制御の挙動が NSFW / 非 NSFW で明示され、DMM family が非 NSFW では最小表示へ倒れることが示されている。
- `fanza_url_required` を含む失敗時応答方針が固定されている。
- 先頭 1 件処理と `WorkReference(store + id)` 単位キャッシュが明示されている。
- Slash Command surface、usage、`ephemeral` 方針が定義されている。
- 運用上の外部依存と主要リスクが文書内で明示されている。

## 11. Agent Operation Notes

- 本要件を実装へ引き渡す際のエージェント運用基準は `~/.codex/AGENTS.md` を参照する。
- 参照スキルは `.codex/skills/<skill>/SKILL.md` にローカル配置したものを優先する。
- ローカル配置が未整備の場合のみ `~/.claude/skills/<skill>/` をコピー元として補充する。
