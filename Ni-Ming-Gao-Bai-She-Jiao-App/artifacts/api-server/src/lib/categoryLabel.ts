// 把網站上的分類（例如 "Hidup · Life"）轉成要顯示在 IG 上的英文標題（例如 "Life"）。
// 資料庫存的是 "Hidup · Life" 全文，或只存 "life" / "hidup" 這種代號都可以。

const LABELS: Record<string, string> = {
  cinta: "Love",
  love: "Love",
  persahabatan: "Friendship",
  friendship: "Friendship",
  keluarga: "Family",
  family: "Family",
  belajar: "School",
  school: "School",
  kerja: "Work",
  work: "Work",
  hidup: "Life",
  life: "Life",
  admin: "ADMIN",
};

export function categoryLabel(raw?: string | null): string {
  if (!raw) return "";
  const parts = raw
    .split(/[\u00b7|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  // 英文通常在後面，所以從後往前找對得上的
  for (let i = parts.length - 1; i >= 0; i--) {
    const hit = LABELS[parts[i].toLowerCase()];
    if (hit) return hit;
  }
  // 對不上的新分類：直接用最後一段，第一個字母大寫
  const last = parts[parts.length - 1] ?? raw.trim();
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function categoryHashtag(label: string): string {
  const tag = label.replace(/[^A-Za-z0-9]/g, "");
  return tag ? `#${tag}` : "";
}
