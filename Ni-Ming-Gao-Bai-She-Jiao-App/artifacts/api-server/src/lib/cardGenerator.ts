import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

export async function generateConfessionCard(id: number | string, content: string): Promise<string> {
  const width = 1080;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景：深色漸層
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 標頭
  ctx.fillStyle = '#a855f7';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(`CONFESSION #${id}`, 100, 160);

  // 告白文字
  ctx.fillStyle = '#f8fafc';
  ctx.font = '36px sans-serif';
  const maxWidth = 880;
  const lineHeight = 54;
  const startX = 100;
  let startY = 260;

  const words = (content || '').split('');
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i];
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

  // 底部標示
  ctx.fillStyle = '#64748b';
  ctx.font = '28px sans-serif';
  ctx.fillText('dream4u.my', 100, height - 100);

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