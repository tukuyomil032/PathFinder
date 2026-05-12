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

## 4. Success Examples

- `/dlsite maniax input:RJ012345`
- `/dlsite books input:https://www.dlsite.com/books/work/=/product_id/BJ02519460.html`
- `/fanza doujin input:d123456`
- `/fanza av input:https://tv.dmm.co.jp/detail/?content=mide00924`
- `/help`
- `/help fanza`

## 5. Failure Examples

- `/dlsite maniax input:BJ02519460`
  - `maniax` は `RJ` 系または maniax URL のみ受け付ける。
- `/fanza game input:RJ012345`
  - `game` は `spal_0201` のような slug または FANZA GAMES URL のみ受け付ける。
- `/fanza doujin input:d123456`
  - bare ID から canonical URL を解決できない場合、通常失敗ではなく URL 付き送信の案内を返す。

## 6. NSFW Visibility

- `/help` は常に `ephemeral`。
- preview 系 command は通常返信。
- 非NSFWチャンネルでは DLSite 成人向け作品の詳細を抑制する。
- 非NSFWチャンネルでは DMM family 全体を最小情報表示に倒す。
- NSFWチャンネルでは通常の詳細 Embed を返す。

## 7. Auto Detection vs Slash Commands

- 自動検出向き:
  - 会話中に URL / ID をそのまま貼るとき
  - 複数人の雑談導線を崩したくないとき
- Slash Command 向き:
  - 対象 store を明示したいとき
  - bare ID だけで明示実行したいとき
  - `/help` で入力形式を即確認したいとき
