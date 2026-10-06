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

function spaced(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "right" = "left",
) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === "left" ? x : x - total;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
}

export function renderConfession(rawText: string, id: number): Buffer {
  ensureFont();

  const w = 1080;
  const h = 1350; // 4:5 直式，IG 動態牆佔版面較大
  const pad = 110;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const font = (px: number) => `${px}px ${FAMILY}, sans-serif`;

  // 背景
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#14102e");
  bg.addColorStop(0.55, "#2b1b5e");
  bg.addColorStop(1, "#4a1d6e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow1 = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, 650);
  glow1.addColorStop(0, "rgba(236,72,153,0.30)");
  glow1.addColorStop(1, "rgba(236,72,153,0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);

  const glow2 = ctx.createRadialGradient(w * 0.1, h * 0.92, 0, w * 0.1, h * 0.92, 700);
  glow2.addColorStop(0, "rgba(99,102,241,0.32)");
  glow2.addColorStop(1, "rgba(99,102,241,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  ctx.textBaseline = "top";

  // 頁首
  ctx.fillStyle = "#c4b5fd";
  ctx.font = font(28);
  spaced(ctx, "CONFESSION", pad, 118, 8, "left");
  spaced(ctx, `#${id}`, w - pad, 118, 4, "right");

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, 178);
  ctx.lineTo(w - pad, 178);
  ctx.stroke();

  // 頁尾
  const footLineY = h - 190;
  ctx.beginPath();
  ctx.moveTo(pad, footLineY);
  ctx.lineTo(w - pad, footLineY);
  ctx.stroke();

  ctx.fillStyle = "#e9d5ff";
  ctx.font = font(30);
  ctx.textAlign = "left";
  ctx.fillText("@confessionmiit", pad, footLineY + 40);
  ctx.fillStyle = "#a78bfa";
  ctx.textAlign = "right";
  ctx.fillText("dream4u.my", w - pad, footLineY + 40);

  // 內文
  const text = stripEmoji(rawText).trim() || " ";
  const areaTop = 240;
  const areaH = footLineY - 60 - areaTop;
  const maxW = w - pad * 2;
  const lineRatio = 1.6;

  let fontSize = 66;
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
  const center = lines.length <= 5;

  ctx.fillStyle = "#f5f3ff";
  ctx.font = font(fontSize);
  ctx.textAlign = center ? "center" : "left";
  lines.forEach((l, i) => {
    ctx.fillText(l, center ? w / 2 : pad, startY + i * lineH);
  });

  return canvas.toBuffer("image/jpeg", 92);
}