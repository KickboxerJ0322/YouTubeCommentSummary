# YouTubeCommentSummary Skill

YouTube動画のコメントを収集し、分析結果をモダンなHTMLレポートとして出力するスキルです。  
通常動画URLとShorts URLの両方に対応しています。

## 主な機能

- コメント取得（最大件数指定可）
- 感情比率（ポジティブ/ネガティブ/ニュートラル）
- 話題カテゴリ集計
- 注目キーワード抽出
- 高評価コメント抜粋
- コメント内容の文章サマリー生成
- 動画サムネイル付きヒーロー表示
- 10種類のカラーテーマをランダム適用

## 使い方

```bash
/YouTubeCommentSummary <YouTubeURL> [MAX_COMMENTS]
```

例:

```bash
/YouTubeCommentSummary https://www.youtube.com/watch?v=dQw4w9WgXcQ 200
/YouTubeCommentSummary https://www.youtube.com/shorts/xxxxxxxxxxx
```

直接実行:

```bash
node .claude/skills/YouTubeCommentSummary/scripts/youtube_comment_summary.mjs "<YouTubeURL>" "<MAX_COMMENTS>"
```

## 出力

- 保存先: `.claude/skills/YouTubeCommentSummary/output/`
- ファイル名: `<動画タイトル>.html`（Windows禁止文字は自動除去）
- 実行時に以下を標準出力
  - 動画タイトル
  - 取得コメント件数
  - 適用カラーテーマ名
  - HTMLレポートの絶対パス

## 必要環境

- Node.js (ESM対応)
- YouTube Data API v3 キー
  - `.claude/skills/YouTubeCommentSummary/.env` に設定
  - `YOUTUBE_API_KEY=...`

## ファイル構成

```text
YouTubeCommentSummary/
├─ .env
├─ package.json
├─ SKILL.md
├─ README.md
├─ scripts/
│  └─ youtube_comment_summary.mjs
└─ output/
```
