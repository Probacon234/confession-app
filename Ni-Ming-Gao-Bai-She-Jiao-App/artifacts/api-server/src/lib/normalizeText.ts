// CJK 字型（Noto Sans TC）會把手機鍵盤自動產生的彎撇號 ’（例如 it’s、won’t）
// 和全形標點畫成「一個中文字那麼寬」，所以句子會出現很大的空隙。
// 這裡在畫圖前先把它們換成一般的半形符號。

// 真正的中日韓文字（不含全形標點）
const HAS_HAN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

// 各種「像撇號」的字元：‘ ’ ʼ ＇（含全形）
const APOSTROPHES = /[\u2018\u2019\u02bc\uff07]/g;

export function normalizePunctuation(s: string): string {
  // 1) 不管內容有沒有中文，撇號、單引號一律換成英文的 '
  s = s.replace(APOSTROPHES, "'");

  // 2) 有中文的內容：其他標點（中文的 ， 。 ： “ ” 等）保留原樣
  if (HAS_HAN.test(s)) return s;

  // 3) 純英文、數字的內容：彎的雙引號、…、全形標點也換成一般符號
  return s
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}
