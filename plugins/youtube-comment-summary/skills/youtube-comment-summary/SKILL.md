---
name: YouTubeCommentSummary
description: YouTube動画コメントを分析し、視覚的なHTMLサマリーレポートを生成する
---

# YouTubeCommentSummary

YouTube動画URLまたはキーワードから、コメント分析レポートをHTMLで出力します。

## 使い方

/YouTubeCommentSummary <YouTubeURL_or_KEYWORD> [MAX_COMMENTS_PER_VIDEO] [MAX_VIDEOS]

`MAX_VIDEOS` は 1-4 の範囲で指定可能（既定値 3）。

例:

/YouTubeCommentSummary https://www.youtube.com/watch?v=dQw4w9WgXcQ 200
/YouTubeCommentSummary "生成AI ニュース" 120 3

## 出力内容

- 動画サムネイルをヘッダー上部に表示
- レポート配色は10パターンから毎回ランダム適用
- コメント内容の文章要約（全体傾向・注目点・代表的な声）
- 感情比率（ポジティブ/ネガティブ/ニュートラル）ドーナツ表示
- 話題カテゴリの件数・割合バー表示
- 主要統計（平均長、質問率、リンク含有率）
- 注目キーワード
- 高評価コメントの抜粋
- HTMLレポート保存先パス

HTMLレポートは以下に生成されます。

- URL指定時: `plugins/youtube-comment-summary/output/<動画タイトル>.html`
- キーワード指定時: `plugins/youtube-comment-summary/output/<キーワード>_top<件数>.html`

## 実行コマンド

node plugins/youtube-comment-summary/scripts/youtube_comment_summary.mjs "<YouTubeURL_or_KEYWORD>" "<MAX_COMMENTS_PER_VIDEO>" "<MAX_VIDEOS>"

