# Slash Command Manual

## 1. Overview

この Bot は自動検出に加えて、明示実行用の Slash Command を提供する。  
自動検出は会話中の URL / ID をそのまま投げる導線、Slash Command は対象 store を明示したいときの導線として使い分ける。

## 2. Command List

- `/dlsite maniax input:<string>`
- `/dlsite books input:<string>`
- `/dlsite pro input:<string>`
- `/fanza doujin input:<string>`
- `/fanza av input:<string>`
- `/fanza game input:<string>`
- `/fanza book input:<string>`
- `/random [store] [keyword]`
- `/help [command]`

## 3. Accepted Input Formats

### `/dlsite`

- `maniax`: `RJ012345` または `https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html`
- `books`: `BJ02519460` または `https://www.dlsite.com/books/work/=/product_id/BJ02519460.html`
- `pro`: `VJ01004728` または `https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html`

### `/fanza`

- `doujin`: `d123456`, `d_123456`, または FANZA同人 URL
- `av`: `mide00924` または `https://tv.dmm.co.jp/detail/?content=mide00924`
- `game`: `spal_0201` または `https://dlsoft.dmm.co.jp/detail/spal_0201/`
- `book`: `b915awnmg04288` または `https://book.dmm.co.jp/product/123456/b915awnmg04288/`

### `/random`

- `store`: DLsite同人/Books/pro、FANZA同人/PCゲーム/BOOKSの6択（任意、省略時は実装済みのstoreからランダム）
- `keyword`: 任意。指定するとその語にヒットする作品群からランダムに1件選ぶ（`/search`と同じ絞り込み）
- 両方省略すると、対象storeの全カタログブラウズ・ジャンルfacet・サークルfacetのいずれかをランダムに選んで抽選する
  - ジャンル/サークルfacetはBot使用実績が溜まるほど候補が増える（起動直後はブラウズのみ）
- 価格帯・声優はランダム抽選の対象外

## 4. Success Examples

- `/dlsite maniax input:RJ012345`
- `/dlsite books input:https://www.dlsite.com/books/work/=/product_id/BJ02519460.html`
- `/fanza doujin input:d123456`
- `/fanza av input:https://tv.dmm.co.jp/detail/?content=mide00924`
- `/help`
- `/help fanza`
- `/random`
- `/random store:dlsite_maniax`
- `/random store:fanza_doujin keyword:ロリ`

## 5. Failure Examples

- `/dlsite maniax input:BJ02519460`
  - `maniax` は `RJ` 系または maniax URL のみ受け付ける。
- `/fanza game input:RJ012345`
  - `game` は `spal_0201` のような slug または FANZA GAMES URL のみ受け付ける。
- `/fanza doujin input:d123456`
  - bare ID から canonical URL を解決できない場合、通常失敗ではなく URL 付き送信の案内を返す。
- `/random store:fanza_doujin keyword:<該当0件になる語>`
  - 抽選候補が0件のため、該当する作品が見つからなかった旨のメッセージを返す（リトライしない）。
- `/random store:fanza_pcgame`
  - FANZA PCゲーム/BOOKSは検索フェッチャー未実装のため、`/search`と同じ汎用エラーになる（既知の制限）。

## 6. NSFW Visibility

- `/help` は常に `ephemeral`。
- preview 系 command は通常返信。
- 非NSFWチャンネルでは DLSite 成人向け作品の詳細を抑制する。
- 非NSFWチャンネルでは DMM family 全体を最小情報表示に倒す。
- NSFWチャンネルでは通常の詳細 Embed を返す。
- `/random`はstore単位の粗いNSFWゲート（`dlsite_maniax`以外は成人向け前提）を通過した後、個別作品はプレビューと同じ作品単位マスキングに従う。

## 7. Auto Detection vs Slash Commands

- 自動検出向き:
  - 会話中に URL / ID をそのまま貼るとき
  - 複数人の雑談導線を崩したくないとき
- Slash Command 向き:
  - 対象 store を明示したいとき
  - bare ID だけで明示実行したいとき
  - `/help` で入力形式を即確認したいとき
