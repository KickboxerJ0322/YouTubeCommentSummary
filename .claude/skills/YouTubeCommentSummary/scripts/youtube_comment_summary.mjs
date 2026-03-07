import dotenv from "dotenv"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, "..", ".env") })

const API_KEY = process.env.YOUTUBE_API_KEY

if (!API_KEY) {
  console.error("YOUTUBE_API_KEY が .env に設定されていません")
  process.exit(1)
}

const [, , url, maxArg] = process.argv
const MAX = Number(maxArg || 300)

function getVideoId(u) {
  try {
    const parsed = new URL(u)

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1)
    }

    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/")[2] || null
    }

    return parsed.searchParams.get("v")
  } catch {
    return null
  }
}

const videoId = getVideoId(url)

if (!videoId) {
  console.error("動画URLが不正です")
  process.exit(1)
}

function cleanText(text) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

async function fetchJSON(endpoint, params) {
  const base = "https://www.googleapis.com/youtube/v3"
  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "")
  )

  const query = new URLSearchParams({
    ...safeParams,
    key: API_KEY
  })

  const res = await fetch(`${base}/${endpoint}?${query}`)

  if (!res.ok) {
    throw new Error(await res.text())
  }

  return res.json()
}

async function getVideoInfo() {
  const data = await fetchJSON("videos", {
    part: "snippet,statistics",
    id: videoId
  })

  const v = data.items?.[0]

  if (!v) {
    throw new Error("動画情報を取得できませんでした")
  }

  return {
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    comments: Number(v.statistics.commentCount || 0),
    thumbnail:
      v.snippet.thumbnails?.maxres?.url ||
      v.snippet.thumbnails?.standard?.url ||
      v.snippet.thumbnails?.high?.url ||
      v.snippet.thumbnails?.medium?.url ||
      v.snippet.thumbnails?.default?.url ||
      ""
  }
}

async function getComments(limit) {
  const comments = []
  let pageToken = null

  while (comments.length < limit) {
    const data = await fetchJSON("commentThreads", {
      part: "snippet",
      videoId,
      maxResults: 100,
      pageToken
    })

    for (const item of data.items || []) {
      const c = item.snippet.topLevelComment.snippet

      comments.push({
        text: cleanText(c.textDisplay),
        likeCount: Number(c.likeCount || 0),
        author: c.authorDisplayName || "unknown",
        publishedAt: c.publishedAt || ""
      })

      if (comments.length >= limit) break
    }

    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }

  return comments
}

function extractKeywords(comments) {
  const words = {}
  const stopwords = new Set([
    "https", "http", "youtube", "watch", "www", "com", "the", "and",
    "that", "this", "with", "from", "your", "have", "you", "for",
    "です", "ます", "する", "した", "して", "いる", "ある", "こと",
    "これ", "それ", "ここ", "そこ", "いい", "よう", "ので", "から",
    "さん", "笑", "ww", "www"
  ])

  for (const { text } of comments) {
    const tokens = text
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    for (const t of tokens) {
      if (t.length < 2) continue
      if (stopwords.has(t)) continue
      words[t] = (words[t] || 0) + 1
    }
  }

  return Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
}

function summarizeComments(comments) {
  const count = comments.length

  if (count === 0) {
    return {
      stats: { avgLength: 0, questionRate: 0, linkRate: 0 },
      themes: [],
      tone: [],
      topLiked: []
    }
  }

  const totalChars = comments.reduce((sum, c) => sum + c.text.length, 0)
  const questionCount = comments.filter(c => /[?？]/.test(c.text)).length
  const linkCount = comments.filter(c => /https?:\/\/\S+/.test(c.text)).length

  const themeRules = [
    { name: "情勢分析・考察", keywords: ["分析", "考察", "解説", "戦略", "地政学", "背景", "歴史"] },
    { name: "米国・トランプ言及", keywords: ["アメリカ", "米国", "トランプ", "usa", "us"] },
    { name: "イスラエル・イラン言及", keywords: ["イスラエル", "イラン", "中東", "テヘラン"] },
    { name: "感謝・称賛", keywords: ["ありがとう", "参考", "勉強", "わかりやすい", "助かる", "最高"] },
    { name: "不安・懸念", keywords: ["不安", "心配", "怖い", "最悪", "危険", "泥沼"] }
  ]

  const themeCounts = themeRules
    .map(rule => {
      const matches = comments.filter(c =>
        rule.keywords.some(k => c.text.toLowerCase().includes(k.toLowerCase()))
      ).length
      return { name: rule.name, count: matches }
    })
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)

  const positive = comments.filter(c =>
    ["ありがとう", "良い", "最高", "素晴らしい", "助かる", "好き"].some(k => c.text.includes(k))
  ).length

  const negative = comments.filter(c =>
    ["不安", "怖い", "ひどい", "最悪", "怒り", "問題"].some(k => c.text.includes(k))
  ).length

  const neutral = Math.max(count - positive - negative, 0)

  const topLiked = [...comments]
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 8)

  return {
    stats: {
      avgLength: totalChars / count,
      questionRate: questionCount / count,
      linkRate: linkCount / count
    },
    themes: themeCounts,
    tone: [
      { name: "ポジティブ", count: positive, color: "var(--positive)" },
      { name: "ネガティブ", count: negative, color: "var(--negative)" },
      { name: "ニュートラル", count: neutral, color: "var(--neutral)" }
    ],
    topLiked
  }
}

function pct(part, total) {
  if (!total) return 0
  return (part / total) * 100
}

function toJst(dateText) {
  if (!dateText) return ""
  const d = new Date(dateText)
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).format(d)
}

const PALETTES = [
  { name: "Ocean Mint", bg: "#edf2f6", panel: "rgba(255,255,255,0.75)", panelStrong: "#ffffff", ink: "#10243b", muted: "#5c6d80", line: "rgba(16,36,59,0.12)", accent: "#0f766e", accent2: "#2563eb", heroFrom: "#0f766e", heroTo: "#2563eb", positive: "#16a34a", negative: "#dc2626", neutral: "#94a3b8", glow1: "rgba(37,99,235,0.25)", glow2: "rgba(15,118,110,0.24)", glow3: "rgba(251,146,60,0.2)" },
  { name: "Sunset Peach", bg: "#fff4ef", panel: "rgba(255,255,255,0.8)", panelStrong: "#fffefe", ink: "#3a1f1d", muted: "#7a5e5a", line: "rgba(58,31,29,0.12)", accent: "#ea580c", accent2: "#db2777", heroFrom: "#ea580c", heroTo: "#db2777", positive: "#16a34a", negative: "#dc2626", neutral: "#a8a29e", glow1: "rgba(251,113,133,0.25)", glow2: "rgba(251,146,60,0.25)", glow3: "rgba(236,72,153,0.18)" },
  { name: "Emerald Forest", bg: "#edf7f0", panel: "rgba(255,255,255,0.76)", panelStrong: "#ffffff", ink: "#133028", muted: "#4f6d61", line: "rgba(19,48,40,0.12)", accent: "#15803d", accent2: "#0f766e", heroFrom: "#15803d", heroTo: "#0f766e", positive: "#16a34a", negative: "#dc2626", neutral: "#94a3b8", glow1: "rgba(16,185,129,0.23)", glow2: "rgba(20,184,166,0.22)", glow3: "rgba(110,231,183,0.2)" },
  { name: "Royal Violet", bg: "#f4f1ff", panel: "rgba(255,255,255,0.78)", panelStrong: "#ffffff", ink: "#25184b", muted: "#645b89", line: "rgba(37,24,75,0.14)", accent: "#7c3aed", accent2: "#2563eb", heroFrom: "#7c3aed", heroTo: "#2563eb", positive: "#22c55e", negative: "#ef4444", neutral: "#94a3b8", glow1: "rgba(124,58,237,0.25)", glow2: "rgba(99,102,241,0.24)", glow3: "rgba(59,130,246,0.18)" },
  { name: "Ruby Wine", bg: "#fff0f4", panel: "rgba(255,255,255,0.8)", panelStrong: "#fffefe", ink: "#3f1228", muted: "#7d4a62", line: "rgba(63,18,40,0.13)", accent: "#be185d", accent2: "#e11d48", heroFrom: "#be185d", heroTo: "#e11d48", positive: "#16a34a", negative: "#dc2626", neutral: "#9ca3af", glow1: "rgba(225,29,72,0.25)", glow2: "rgba(190,24,93,0.22)", glow3: "rgba(251,113,133,0.18)" },
  { name: "Slate Tech", bg: "#edf1f7", panel: "rgba(255,255,255,0.73)", panelStrong: "#ffffff", ink: "#0f172a", muted: "#475569", line: "rgba(15,23,42,0.15)", accent: "#0284c7", accent2: "#4f46e5", heroFrom: "#0284c7", heroTo: "#4f46e5", positive: "#22c55e", negative: "#ef4444", neutral: "#94a3b8", glow1: "rgba(2,132,199,0.24)", glow2: "rgba(79,70,229,0.2)", glow3: "rgba(148,163,184,0.2)" },
  { name: "Golden Sand", bg: "#fff8ea", panel: "rgba(255,255,255,0.8)", panelStrong: "#fffdfa", ink: "#3a2b11", muted: "#7a6646", line: "rgba(58,43,17,0.13)", accent: "#ca8a04", accent2: "#f59e0b", heroFrom: "#ca8a04", heroTo: "#f59e0b", positive: "#16a34a", negative: "#dc2626", neutral: "#a8a29e", glow1: "rgba(250,204,21,0.24)", glow2: "rgba(245,158,11,0.24)", glow3: "rgba(251,146,60,0.18)" },
  { name: "Aqua Breeze", bg: "#eaf9fb", panel: "rgba(255,255,255,0.76)", panelStrong: "#ffffff", ink: "#0f2f35", muted: "#4d6b71", line: "rgba(15,47,53,0.13)", accent: "#0891b2", accent2: "#06b6d4", heroFrom: "#0891b2", heroTo: "#06b6d4", positive: "#22c55e", negative: "#ef4444", neutral: "#94a3b8", glow1: "rgba(6,182,212,0.24)", glow2: "rgba(45,212,191,0.24)", glow3: "rgba(56,189,248,0.17)" },
  { name: "Graphite Neon", bg: "#f1f3f5", panel: "rgba(255,255,255,0.74)", panelStrong: "#ffffff", ink: "#111827", muted: "#4b5563", line: "rgba(17,24,39,0.14)", accent: "#0ea5e9", accent2: "#22d3ee", heroFrom: "#0ea5e9", heroTo: "#22d3ee", positive: "#22c55e", negative: "#ef4444", neutral: "#9ca3af", glow1: "rgba(14,165,233,0.2)", glow2: "rgba(34,211,238,0.2)", glow3: "rgba(99,102,241,0.16)" },
  { name: "Cherry Pop", bg: "#fff1f0", panel: "rgba(255,255,255,0.8)", panelStrong: "#fffefe", ink: "#3b1212", muted: "#7f4a4a", line: "rgba(59,18,18,0.13)", accent: "#ef4444", accent2: "#f97316", heroFrom: "#ef4444", heroTo: "#f97316", positive: "#16a34a", negative: "#dc2626", neutral: "#9ca3af", glow1: "rgba(239,68,68,0.24)", glow2: "rgba(249,115,22,0.24)", glow3: "rgba(251,113,133,0.17)" }
]

function choosePalette() {
  const idx = Math.floor(Math.random() * PALETTES.length)
  return PALETTES[idx]
}

function sanitizeFileName(name) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)

  return cleaned || "youtube_comment_summary"
}

function pickRepresentativeComment(comments, keywords) {
  const hit = comments.find(c => keywords.some(k => c.text.includes(k)))
  return hit ? hit.text : ""
}

function generateNarrativeSummary(summary, keywords, comments) {
  const total = comments.length || 1
  const pos = summary.tone.find(t => t.name === "ポジティブ")?.count || 0
  const neg = summary.tone.find(t => t.name === "ネガティブ")?.count || 0
  const neu = summary.tone.find(t => t.name === "ニュートラル")?.count || 0

  const themeTop = summary.themes.slice(0, 2)
  const themeText = themeTop.length
    ? themeTop.map(t => `${t.name}（${pct(t.count, total).toFixed(1)}%）`).join("、")
    : "特定テーマへの集中は弱く"

  const keyTop = keywords.slice(0, 3).map(([w]) => `「${w}」`).join("、")
  const neutralDominant = neu >= pos && neu >= neg
  const toneLine = neutralDominant
    ? `全体としてはニュートラルが中心（${pct(neu, total).toFixed(1)}%）で、`
    : "感情の偏りが比較的見られ、"

  const positiveSample = pickRepresentativeComment(comments, ["ありがとう", "助かる", "最高", "良い"])
  const concernSample = pickRepresentativeComment(comments, ["不安", "心配", "問題", "怖い"])

  const body1 = `コメント全体では${themeText}に関する反応が目立ちました。${toneLine}ポジティブ ${pct(pos, total).toFixed(1)}%、ネガティブ ${pct(neg, total).toFixed(1)}% という構成です。`
  const body2 = keyTop
    ? `頻出キーワードは${keyTop}が上位に入り、視聴者の注目点が明確に表れています。`
    : "頻出キーワードの傾向は分散しており、話題は広く分かれています。"
  const body3 = positiveSample || concernSample
    ? `代表的な声として、${positiveSample ? `前向きな反応「${positiveSample.slice(0, 60)}${positiveSample.length > 60 ? "..." : ""}」` : ""}${positiveSample && concernSample ? "、" : ""}${concernSample ? `懸念を示す反応「${concernSample.slice(0, 60)}${concernSample.length > 60 ? "..." : ""}」` : ""}が確認できます。`
    : "代表コメントには、状況共有や意見表明がバランスよく含まれていました。"

  return [body1, body2, body3]
}

function buildHTML({ info, summary, keywords, comments, sourceUrl, palette }) {
  const total = comments.length || 1
  const pos = summary.tone.find(t => t.name === "ポジティブ")?.count || 0
  const neg = summary.tone.find(t => t.name === "ネガティブ")?.count || 0
  const neu = summary.tone.find(t => t.name === "ニュートラル")?.count || 0

  const posP = pct(pos, total)
  const negP = pct(neg, total)
  const neuP = pct(neu, total)

  const donut = `conic-gradient(
    var(--positive) 0 ${posP}%,
    var(--negative) ${posP}% ${posP + negP}%,
    var(--neutral) ${posP + negP}% 100%
  )`

  const themeRows = summary.themes.slice(0, 6).map(t => {
    const ratio = pct(t.count, total)
    return `
      <div class="bar-row">
        <div class="bar-head">
          <span>${escapeHtml(t.name)}</span>
          <span>${t.count}件 / ${ratio.toFixed(1)}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${ratio.toFixed(1)}%"></div></div>
      </div>
    `
  }).join("")

  const keywordTags = keywords.slice(0, 12).map(([word, count]) =>
    `<span class="tag">${escapeHtml(word)} <b>${count}</b></span>`
  ).join("")

  const spotlight = summary.topLiked.slice(0, 6).map(c => `
    <article class="comment-card">
      <div class="meta">👍 ${c.likeCount} / ${escapeHtml(c.author)} / ${escapeHtml(toJst(c.publishedAt))}</div>
      <p>${escapeHtml(c.text)}</p>
    </article>
  `).join("")

  const narrative = generateNarrativeSummary(summary, keywords, comments)

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>YouTube Comment Summary</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap");

    :root {
      --bg: ${palette.bg};
      --panel: ${palette.panel};
      --panel-strong: ${palette.panelStrong};
      --ink: ${palette.ink};
      --muted: ${palette.muted};
      --line: ${palette.line};
      --accent: ${palette.accent};
      --accent-2: ${palette.accent2};
      --positive: ${palette.positive};
      --negative: ${palette.negative};
      --neutral: ${palette.neutral};
      --shadow: 0 20px 55px rgba(15, 23, 42, 0.12);
      --shadow-soft: 0 8px 24px rgba(15, 23, 42, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Outfit", "Noto Sans JP", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 14%, ${palette.glow1} 0%, transparent 36%),
        radial-gradient(circle at 90% 2%, ${palette.glow2} 0%, transparent 40%),
        radial-gradient(circle at 80% 90%, ${palette.glow3} 0%, transparent 32%),
        var(--bg);
      min-height: 100vh;
    }

    .wrap {
      max-width: 1120px;
      margin: 0 auto;
      padding: 30px 16px 64px;
    }

    .hero {
      background:
        linear-gradient(140deg, ${palette.heroFrom}, ${palette.heroTo}),
        linear-gradient(20deg, ${palette.heroFrom}, ${palette.heroTo});
      color: #f8fcff;
      border-radius: 28px;
      padding: 26px;
      box-shadow: var(--shadow);
      position: relative;
      overflow: hidden;
    }

    .hero-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) clamp(320px, 34vw, 430px);
      gap: 16px;
      align-items: stretch;
      position: relative;
      z-index: 2;
    }

    .hero-media {
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.34);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      background: rgba(0, 0, 0, 0.18);
      width: 100%;
      height: clamp(180px, 22vw, 245px);
      justify-self: end;
      align-self: center;
    }

    .hero-media img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(1.01);
    }

    .hero::after {
      content: "";
      position: absolute;
      width: 260px;
      height: 260px;
      right: -60px;
      top: -70px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.02));
    }

    .kicker {
      opacity: 0.9;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    h1 {
      margin: 10px 0 14px;
      font-size: clamp(26px, 4.6vw, 48px);
      line-height: 1.14;
      letter-spacing: -0.01em;
      max-width: 100%;
    }

    .sub {
      display: grid;
      gap: 7px;
      color: #eaf4ff;
      font-size: 14px;
      position: relative;
      z-index: 2;
    }

    .pill-row {
      margin-top: 16px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      position: relative;
      z-index: 2;
    }

    .pill {
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.28);
      font-size: 13px;
      backdrop-filter: blur(6px);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
      margin-top: 16px;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px 18px 20px;
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(10px);
    }

    .title {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .narrative { grid-column: span 12; }
    .sentiment { grid-column: span 5; }
    .themes { grid-column: span 7; }
    .keywords { grid-column: span 4; }
    .stats { grid-column: span 8; }
    .spotlight { grid-column: span 12; }

    .donut {
      width: min(250px, 90%);
      aspect-ratio: 1;
      margin: 8px auto 14px;
      border-radius: 50%;
      background: ${donut};
      position: relative;
      animation: popIn 650ms ease;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    }

    .donut::after {
      content: "";
      position: absolute;
      inset: 21%;
      background: var(--panel-strong);
      border-radius: 50%;
      border: 1px solid var(--line);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
    }

    .legend { display: grid; gap: 8px; }
    .legend-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
    }

    .dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-right: 6px;
    }

    .bar-row { margin-bottom: 12px; }
    .bar-head {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      margin-bottom: 5px;
    }

    .bar-track {
      width: 100%;
      height: 12px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.24);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      animation: grow 850ms ease;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .stat {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.45));
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 13px;
    }

    .stat label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 5px;
    }

    .stat b {
      font-size: 22px;
      line-height: 1;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag {
      padding: 8px 11px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.65);
      font-size: 12px;
      white-space: nowrap;
    }

    .narrative-box {
      font-family: "Noto Sans JP", sans-serif;
      font-size: 15px;
      line-height: 1.85;
      color: #243447;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.68));
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
    }

    .narrative-box p {
      margin: 0 0 10px;
    }

    .narrative-box p:last-child {
      margin-bottom: 0;
    }

    .comment-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .comment-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 13px;
      background: rgba(255, 255, 255, 0.78);
    }

    .comment-card .meta {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .comment-card p {
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
    }

    .foot {
      margin-top: 12px;
      font-size: 12px;
      color: var(--muted);
      text-align: right;
    }

    @media (max-width: 880px) {
      .narrative, .sentiment, .themes, .keywords, .stats, .spotlight { grid-column: span 12; }
      .comment-grid { grid-template-columns: 1fr; }
      .stat-grid { grid-template-columns: 1fr; }
      .pill-row { gap: 8px; }
      .hero-head {
        grid-template-columns: 1fr;
      }
      .hero-media {
        width: 100%;
        height: auto;
        max-width: 220px;
        aspect-ratio: 16 / 9;
        justify-self: start;
      }
    }

    @keyframes grow {
      from { width: 0; }
      to { width: 100%; }
    }

    @keyframes popIn {
      from { transform: scale(0.94); opacity: 0.3; }
      to { transform: scale(1); opacity: 1; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="kicker">YouTube Comment Intelligence</div>
      <div class="hero-head">
        <h1>${escapeHtml(info.title)}</h1>
        ${info.thumbnail ? `<div class="hero-media"><img src="${escapeHtml(info.thumbnail)}" alt="YouTube thumbnail" loading="eager" /></div>` : ""}
      </div>
      <div class="sub">
        <div>Channel: ${escapeHtml(info.channel)}</div>
        <div>取得コメント: ${comments.length} / 総コメント数: ${info.comments}</div>
        <div>分析対象URL: <a href="${escapeHtml(sourceUrl)}" style="color:#d8f3ff">${escapeHtml(sourceUrl)}</a></div>
      </div>
      <div class="pill-row">
        <div class="pill">ポジティブ ${posP.toFixed(1)}%</div>
        <div class="pill">ネガティブ ${negP.toFixed(1)}%</div>
        <div class="pill">ニュートラル ${neuP.toFixed(1)}%</div>
      </div>
      </section>

    <section class="grid">
      <article class="card narrative">
        <h2 class="title">コメント内容の要約</h2>
        <div class="narrative-box">
          <p>${escapeHtml(narrative[0])}</p>
          <p>${escapeHtml(narrative[1])}</p>
          <p>${escapeHtml(narrative[2])}</p>
        </div>
      </article>

      <article class="card sentiment">
        <h2 class="title">感情比率</h2>
        <div class="donut"></div>
        <div class="legend">
          <div class="legend-item"><span><i class="dot" style="background:var(--positive)"></i>ポジティブ</span><span>${pos}件 (${posP.toFixed(1)}%)</span></div>
          <div class="legend-item"><span><i class="dot" style="background:var(--negative)"></i>ネガティブ</span><span>${neg}件 (${negP.toFixed(1)}%)</span></div>
          <div class="legend-item"><span><i class="dot" style="background:var(--neutral)"></i>ニュートラル</span><span>${neu}件 (${neuP.toFixed(1)}%)</span></div>
        </div>
      </article>

      <article class="card themes">
        <h2 class="title">話題の集中度</h2>
        ${themeRows || "<p>有意な偏りは検出されませんでした。</p>"}
      </article>

      <article class="card stats">
        <h2 class="title">統計</h2>
        <div class="stat-grid">
          <div class="stat"><label>平均コメント長</label><b>${summary.stats.avgLength.toFixed(1)}</b> 文字</div>
          <div class="stat"><label>質問コメント率</label><b>${(summary.stats.questionRate * 100).toFixed(1)}</b>%</div>
          <div class="stat"><label>リンク含有率</label><b>${(summary.stats.linkRate * 100).toFixed(1)}</b>%</div>
        </div>
      </article>

      <article class="card keywords">
        <h2 class="title">注目キーワード</h2>
        <div class="tags">${keywordTags}</div>
      </article>

      <article class="card spotlight">
        <h2 class="title">注目されているコメント（高評価）</h2>
        <div class="comment-grid">
          ${spotlight || "<p>コメントを取得できませんでした。</p>"}
        </div>
      </article>
    </section>

    <p class="foot">Generated at ${escapeHtml(toJst(new Date().toISOString()))} (JST)</p>
  </main>
</body>
</html>`
}

async function main() {
  const info = await getVideoInfo()
  const comments = await getComments(MAX)
  const keywords = extractKeywords(comments)
  const summary = summarizeComments(comments)
  const palette = choosePalette()

  const html = buildHTML({
    info,
    summary,
    keywords,
    comments,
    sourceUrl: url,
    palette
  })

  const outDir = path.join(__dirname, "..", "output")
  await fs.mkdir(outDir, { recursive: true })

  const safeTitle = sanitizeFileName(info.title)
  const reportPath = path.join(outDir, `${safeTitle}.html`)
  await fs.writeFile(reportPath, html, "utf8")

  console.log("# YouTube Comment Summary")
  console.log(`動画タイトル: ${info.title}`)
  console.log(`取得コメント: ${comments.length}`)
  console.log(`カラーテーマ: ${palette.name}`)
  console.log(`HTMLレポート: ${reportPath}`)
}

main().catch(err => {
  console.error(err?.message || err)
  process.exit(1)
})
