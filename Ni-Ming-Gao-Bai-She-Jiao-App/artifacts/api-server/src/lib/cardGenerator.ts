import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

export async function generateConfessionCard(id: number | string, content: string): Promise<string> {
  const width = 1080;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 预处理文本：将智能引号替换为普通引号
  const normalizedContent = content
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")  // 替换各种撇号为普通撇号
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"'); // 替换各种引号为普通引号

  // 背景：深色漸層
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 標頭
  ctx.fillStyle = '#a855f7';
  ctx.font = 'bold 44px Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`CONFESSION #${id}`, 100, 160);

  // 告白文字 - 使用 Helvetica 字体
  ctx.fillStyle = '#f8fafc';
  ctx.font = '36px Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'top';
  const maxWidth = 880;
  const lineHeight = 54;
  const startX = 100;
  let startY = 260;

  // 按词分割而不是按字符分割，避免缩写词的间距问题
  const words = (normalizedContent || '').split(' ');
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(currentLine, startX, startY);
      currentLine = words[i];
      startY += lineHeight;
      if (startY > height - 150) break;
    } else {
      currentLine = testLine;
    }
  }
  ctx.fillText(currentLine, startX, startY);

  // 存入公開目錄
  const publicCardsDir = path.join(process.cwd(), 'public', 'cards');
  if (!fs.existsSync(publicCardsDir)) {
    fs.mkdirSync(publicCardsDir, { recursive: true });
  }

  const fileName = `confession-${id}.png`;
  const filePath = path.join(publicCardsDir, fileName);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

  return `https://dream4u.my/cards/${fileName}`;
}