# YoutubeLive Template

YouTube Studio の配信・動画メタデータをテンプレートとして保存・適用する Chrome 拡張（Manifest V3）。

現行バージョン: **3.2.5.0**

## できること

- タイトル / 概要 / タグの保存と適用
- カテゴリ（`CREATOR_VIDEO_CATEGORY_*`）
- ゲームタイトル（カテゴリがゲームのとき）
- 再生リスト（表示名 + `test-id` の `PL…`）
- `/livestreaming/manage` の作成ダイアログと `/video/{id}/edit` を別経路で扱う
- ポップアップから YouTube Studio とライブ予約管理を開く

## インストール

1. `chrome://extensions` を開く
2. デベロッパーモードをオン
3. 「パッケージ化されていない拡張機能を読み込む」
4. このリポジトリのルート（`manifest.json` がある階層）を選ぶ

`manifest.json` の `key` は拡張 ID を維持するための公開鍵です。同じプロファイルなら既存データが続きやすいです。

## 使い方

1. Studio でタイトル・概要が見える画面を開く（作成ダイアログまたは動画編集）
2. 拡張アイコン → 保存
3. 別の枠で「適用」。適用後は Studio 側の保存を押す

再生リストは `表示名|PLxxxx` 形式。同じ `test-id` は一意です。件数上限はありません。

## 画面

| 画面 | URL |
|---|---|
| ライブ予約の作成 | `https://studio.youtube.com/channel/UC…/livestreaming/manage` |
| 動画の編集 | `https://studio.youtube.com/video/{id}/edit` |

## 制限

- サムネイル差し替えは対象外
- YouTube が DOM を変えると欄検出が外れることがある
