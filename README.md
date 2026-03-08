# YouTubeCommentSummary Skill

YouTube動画コメントを収集し、分析結果をHTMLレポートとして出力するスキルです。  
通常動画URL/Shorts URLに加え、キーワード検索にも対応しています。

## 主な機能

- URL指定: コメント取得（最大件数指定可）
- キーワード指定: 関連動画の上位最大4件を検索して横断分析
- 感情比率（ポジティブ/ネガティブ/ニュートラル）
- 話題カテゴリ集計
- 注目キーワード抽出
- 高評価コメント抜粋
- コメント内容の文章サマリー生成
- 動画内容（タイトル/概要/チャンネル/公開日時）の要約表示

## 使い方

```bash
/YouTubeCommentSummary <YouTubeURL_or_KEYWORD> [MAX_COMMENTS_PER_VIDEO] [MAX_VIDEOS]
```

`MAX_VIDEOS` は 1-4 の範囲で指定できます（既定値 4）。

例:

```bash
/YouTubeCommentSummary https://www.youtube.com/watch?v=xxxxxxxxxx 200
/YouTubeCommentSummary https://www.youtube.com/shorts/xxxxxxxxxxx
/YouTubeCommentSummary "生成AI ニュース" 120 3
```

直接実行:

```bash
node plugins/youtube-comment-summary/scripts/youtube_comment_summary.mjs "<YouTubeURL_or_KEYWORD>" "<MAX_COMMENTS_PER_VIDEO>" "<MAX_VIDEOS>"
```

## 出力

- 保存先: `plugins/youtube-comment-summary/output/`
- ファイル名:
  - URL指定時: `<動画タイトル>.html`
  - キーワード指定時: `<キーワード>_top<件数>.html`
- 実行時に以下を標準出力
  - 実行モード（URL / キーワード）
  - 動画タイトルまたはキーワード
  - 取得コメント件数（キーワード時は総件数）
  - 適用カラーテーマ名
  - HTMLレポートの絶対パス

## 必要環境

- Node.js (ESM対応)
- YouTube Data API v3 キー
  - `plugins/youtube-comment-summary/.env` に設定
  - `YOUTUBE_API_KEY=...`

## ファイル構成

```text
.claude-plugin/
└─ marketplace.json

plugins/
└─ youtube-comment-summary/
   ├─ .claude-plugin/
   │  └─ plugin.json
   ├─ .env
   ├─ package.json
   ├─ skills/
   │  └─ youtube-comment-summary/
   │     └─ SKILL.md
   ├─ scripts/
   │  └─ youtube_comment_summary.mjs
   └─ output/
```

## 出力結果

[サンプル画像1](01_sample01.png)
[サンプル画像2](02_sample02.png)

## 動画

[YouTubeCommentSummary](https://www.youtube.com/watch?v=KaFmN7d8xKM)
