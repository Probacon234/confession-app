import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

const FONT_FILE = "NotoSansTC-Bold.ttf";
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
  GlobalFonts.registerFromPath(found, "NotoTC");
  fontReady = true;
}

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function renderConfession(text: string, id: number): Buffer {
  ensureFont();
  const size = 1080;
  const pad = 100;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#1e1b4b");
  bg.addColorStop(1, "#4c1d95");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const maxHeight = size - 360;
  let fontSize = 56;
  let lines: string[] = [];
  for (; fontSize >= 28; fontSize -= 4) {
    ctx.font = `${fontSize}px NotoTC`;
    lines = wrap(ctx, text, size - pad * 2);
    if (lines.length * fontSize * 1.5 <= maxHeight) break;
  }
  const maxLines = Math.floor(maxHeight / (fontSize * 1.5));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + "…";
  }

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${fontSize}px NotoTC`;
  const lineH = fontSize * 1.5;
  const startY = (size - lines.length * lineH) / 2;
  lines.forEach((l, i) => ctx.fillText(l, pad, startY + i * lineH));

  ctx.font = "36px NotoTC";
  ctx.fillStyle = "#c4b5fd";
  ctx.fillText(`#Confession${id}`, pad, 80);
  ctx.textAlign = "right";
  ctx.fillText("@confessionmiit", size - pad, size - 90);

  return canvas.toBuffer("image/jpeg", 90);
}