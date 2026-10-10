import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { categoryLabel } from "./categoryLabel";

// ==================== 想調整外觀，改這一區就好 ====================
const STYLE = {
  // 顏色
  bg: "#fbe4ec", // 背景粉紅
  circleTop: "#e9d5ff", // 右上角淡紫圓
  circleBottom: "#cfe6ff", // 左下角淡藍圓
  panel: "rgba(255,255,255,0.68)", // 半透明白色卡片
  header: "#b0527f", // 頁首標題（#Confession編號 · 分類）
  divider: "#e8b4cb", // 小分隔線
  text: "#4a2c4f", // 內文
  footer: "#7a5a86", // 頁尾帳號

  // 字大小
  maxFont: 64, // 內文最大字級（字少時用這個）
  minFont: 30, // 單頁塞得下的最小字級（再小就改成分頁）
  headerSize: 38, // 頁首標題字大小
  footerSize: 32,

  // 長文分頁（單頁塞不下時才會用到）
  pageFont: 32, // 分頁時的內文字級（調小 → 每頁字更多、頁數更少）
  pageIndicatorSize: 28, // 頁碼 "1 / 3" 的字大小
  maxPages: 10, // IG 輪播最多 10 張

  // 頁尾文字
  footerText: "@confessionmiit",
};

// ====================================================================

const FONT_FILE = "NotoSansTC-Bold.ttf";
const FAMILY = "NotoTC";
let fontReady = false;

function ensureFont() {
  if (fontReady) return;
  const candidates = [
    path.resolve(__dirname, "../fonts", FONT_FILE),
    path.resolve(process.cwd(), "fonts", FONT_FILE),
    path.resolve(process.cwd(), "artifacts/api-server/fonts", FONT_FILE),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Font not found. Tried: ${candidates.join(", ")}`);
  const bytes = fs.statSync(found).size;
  const key = GlobalFonts.registerFromPath(found, FAMILY);
  if (!key) {
    throw new Error(`Failed to load font ${found} (${bytes} bytes). Is it a valid .ttf file?`);
  }
  fontReady = true;
}

// 中日韓字元逐字斷行；英文、數字以「單字」為單位斷行
const CJK = "\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF\\u3000-\\u303F";
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, "g");

// 字型沒有 emoji，直接移除避免出現方塊
function stripEmoji(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x1f000 && cp <= 0x1faff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      cp === 0xfe0f ||
      cp === 0x200d
    ) {
      continue;
    }
    out += ch;
  }
  return out;
}

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const tok of para.match(TOKEN) ?? []) {
      const isSpace = tok.trim() === "";
      if (isSpace && line === "") continue;
      if (ctx.measureText(line + tok).width <= maxWidth) {
        line += tok;
        continue;
      }
      if (isSpace) continue;
      if (line.trim()) {
        out.push(line.trimEnd());
        line = "";
      }
      if (ctx.measureText(tok).width <= maxWidth) {
        line = tok;
        continue;
      }
      for (const ch of tok) {
        if (ctx.measureText(line + ch).width > maxWidth) {
          out.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function spacedCenter(
  ctx: SKRSContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
}

function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- 版面常數（1:1 正方形） ----
const SIZE = 1080;
const PANEL = 60;
const AREA_TOP = 250; // 內文區上緣
const AREA_BOTTOM = 840; // 內文區下緣
const AREA_H = AREA_BOTTOM - AREA_TOP;
const MAX_W = SIZE - PANEL * 2 - 180; // 左右各留 90
const LINE_RATIO = 1.6;

const font = (px: number) => `${px}px ${FAMILY}, sans-serif`;

type Layout =
  | { paged: false; fontSize: number; lines: string[] }
  | { paged: true; fontSize: number; pages: string[][] };

// 決定這篇貼文是單頁還是分頁，並算好每一頁要放哪些行
function layoutText(rawText: string): Layout {
  ensureFont();
  const ctx = createCanvas(SIZE, SIZE).getContext("2d");
  const text =
    stripEmoji(rawText).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim() || " ";

  // 1. 先試單頁：字級從大到小，塞得下就用單頁（外觀跟以前一樣）
  for (let px = STYLE.maxFont; px >= STYLE.minFont; px -= 2) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, MAX_W);
    if (lines.length * px * LINE_RATIO <= AREA_H) {
      return { paged: false, fontSize: px, lines };
    }
  }

  // 2. 單頁塞不下 → 用固定字級分頁
  const fontSize = STYLE.pageFont;
  ctx.font = font(fontSize);
  let lines = wrap(ctx, text, MAX_W);
  const maxPerPage = Math.max(1, Math.floor(AREA_H / (fontSize * LINE_RATIO)));
  let pageCount = Math.ceil(lines.length / maxPerPage);
  let truncated = false;
  if (pageCount > STYLE.maxPages) {
    pageCount = STYLE.maxPages;
    lines = lines.slice(0, maxPerPage * pageCount);
    truncated = true;
  }

  // 平均分配每頁行數，避免最後一頁只剩一兩行
  const perPage = Math.ceil(lines.length / pageCount);
  const pages: string[][] = [];
  for (let i = 0; i < pageCount; i++) {
    const chunk = lines.slice(i * perPage, (i + 1) * perPage);
    while (chunk.length && chunk[0].trim() === "") chunk.shift();
    while (chunk.length && chunk[chunk.length - 1].trim() === "") chunk.pop();
    if (chunk.length) pages.push(chunk);
  }

  // 超過 10 頁的極端情況：最後一行加上 …
  if (truncated && pages.length) {
    const last = pages[pages.length - 1];
    last[last.length - 1] = last[last.length - 1].replace(/.$/, "") + "…";
  }

  if (pages.length <= 1) {
    return { paged: false, fontSize, lines: pages[0] ?? [text] };
  }
  return { paged: true, fontSize, pages };
}

// 這篇貼文會被切成幾頁（1 = 單張圖）
export function countConfessionPages(rawText: string): number {
  const layout = layoutText(rawText);
  return layout.paged ? layout.pages.length : 1;
}

export function renderConfession(
  rawText: string,
  id: number,
  category?: string | null,
  page = 1,
): Buffer {
  ensureFont();

  const layout = layoutText(rawText);
  const totalPages = layout.paged ? layout.pages.length : 1;
  const pageIndex = Math.min(Math.max(1, Math.floor(page) || 1), totalPages) - 1;

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = STYLE.circleTop;
  ctx.beginPath();
  ctx.arc(SIZE - 20, 40, 400, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = STYLE.circleBottom;
  ctx.beginPath();
  ctx.arc(60, SIZE + 20, 360, 0, Math.PI * 2);
  ctx.fill();

  // 半透明白色卡片
  ctx.fillStyle = STYLE.panel;
  roundedRect(ctx, PANEL, PANEL, SIZE - PANEL * 2, SIZE - PANEL * 2, 56);
  ctx.fill();

  ctx.textBaseline = "top";
  const cx = SIZE / 2;

  // 頁首：一行標題，例如 "#Confession69 · Life"
  let label = stripEmoji(categoryLabel(category)).trim();
  if (label.length > 30) label = label.slice(0, 29) + "…";
  const title = label ? `#Confession${id} \u00b7 ${label}` : `#Confession${id}`;
  ctx.fillStyle = STYLE.header;
  ctx.font = font(STYLE.headerSize);
  spacedCenter(ctx, title, cx, 132, 3);

  // 小分隔線
  ctx.strokeStyle = STYLE.divider;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 44, 205);
  ctx.lineTo(cx + 44, 205);
  ctx.stroke();

  // 頁尾
  ctx.fillStyle = STYLE.footer;
  ctx.font = font(STYLE.footerSize);
  ctx.textAlign = "center";
  ctx.fillText(STYLE.footerText, cx, 880);

  // 頁碼（只有分頁時才顯示）
  if (totalPages > 1) {
    ctx.font = font(STYLE.pageIndicatorSize);
    ctx.fillText(`${pageIndex + 1} / ${totalPages}`, cx, 934);
  }

  // 內文
  const fontSize = layout.fontSize;
  const lineH = fontSize * LINE_RATIO;
  const lines = layout.paged ? layout.pages[pageIndex] : layout.lines;
  const centered = !layout.paged && lines.length <= 6;
  const startY = layout.paged
    ? AREA_TOP
    : AREA_TOP + (AREA_H - lines.length * lineH) / 2;

  ctx.fillStyle = STYLE.text;
  ctx.font = font(fontSize);
  ctx.textAlign = centered ? "center" : "left";
  const textX = centered ? cx : PANEL + 90;
  lines.forEach((l, i) => {
    ctx.fillText(l, textX, startY + i * lineH);
  });

  return canvas.toBuffer("image/jpeg", 92);
}