import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

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

export function renderConfession(rawText: string, id: number): Buffer {
  ensureFont();

  const size = 1080; // 1:1 正方形
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const font = (px: number) => `${px}px ${FAMILY}, sans-serif`;

  // 柔和粉彩背景
  ctx.fillStyle = "#fbe4ec";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#e9d5ff";
  ctx.beginPath();
  ctx.arc(size - 20, 40, 400, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#cfe6ff";
  ctx.beginPath();
  ctx.arc(60, size + 20, 360, 0, Math.PI * 2);
  ctx.fill();

  // 半透明白色卡片
  const panel = 60;
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  roundedRect(ctx, panel, panel, size - panel * 2, size - panel * 2, 56);
  ctx.fill();

  ctx.textBaseline = "top";
  const cx = size / 2;

  // 頁首
  ctx.fillStyle = "#b0527f";
  ctx.font = font(30);
  spacedCenter(ctx, `CONFESSION  #${id}`, cx, 140, 6);

  // 小分隔線
  ctx.strokeStyle = "#e8b4cb";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 44, 205);
  ctx.lineTo(cx + 44, 205);
  ctx.stroke();

  // 頁尾
  ctx.fillStyle = "#7a5a86";
  ctx.font = font(32);
  ctx.textAlign = "center";
  ctx.fillText("@confessionmiit", cx, 880);

  // 內文
  const text = stripEmoji(rawText).trim() || " ";
  const areaTop = 250;
  const areaBottom = 840;
  const areaH = areaBottom - areaTop;
  const maxW = size - panel * 2 - 180; // 左右各留 90
  const lineRatio = 1.6;

  let fontSize = 64;
  let lines: string[] = [];
  for (; fontSize >= 30; fontSize -= 2) {
    ctx.font = font(fontSize);
    lines = wrap(ctx, text, maxW);
    if (lines.length * fontSize * lineRatio <= areaH) break;
  }
  const maxLines = Math.floor(areaH / (fontSize * lineRatio));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "") + "…";
  }

  const lineH = fontSize * lineRatio;
  const startY = areaTop + (areaH - lines.length * lineH) / 2;
  const center = lines.length <= 6;

  ctx.fillStyle = "#4a2c4f";
  ctx.font = font(fontSize);
  ctx.textAlign = center ? "center" : "left";
  const textX = center ? cx : panel + 90;
  lines.forEach((l, i) => {
    ctx.fillText(l, textX, startY + i * lineH);
  });

  return canvas.toBuffer("image/jpeg", 92);
}