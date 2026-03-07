---
name: YouTubeCommentSummary
description: YouTube動画コメントを分析し、視覚的なHTMLサマリーレポートを生成する
---

# YouTubeCommentSummary

YouTube動画URLからコメントを取得し、統計・感情比率・注目コメントをHTMLページで出力します。

## 使い方

/YouTubeCommentSummary <YouTubeURL> [MAX_COMMENTS]

例:

/YouTubeCommentSummary https://www.youtube.com/watch?v=dQw4w9WgXcQ 200

## 出力内容

- 動画サムネイルをヘッダー上部に表示`r`n- レポート配色は10パターンから毎回ランダム適用
- コメント内容の文章要約（全体傾向・注目点・代表的な声）
- 感情比率（ポジティブ/ネガティブ/ニュートラル）ドーナツ表示
- 話題カテゴリの件数・割合バー表示
- 主要統計（平均長、質問率、リンク含有率）
- 注目キーワード
- 高評価コメントの抜粋
- HTMLレポート保存先パス

HTMLレポートは以下に生成されます。

- `.claude/skills/YouTubeCommentSummary/output/<動画タイトル>.html`

## 実行コマンド

node .claude/skills/YouTubeCommentSummary/scripts/youtube_comment_summary.mjs "<YouTubeURL>" "<MAX_COMMENTS>"

