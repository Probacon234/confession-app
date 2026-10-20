import { eq } from "drizzle-orm";
import { confessionsTable, db } from "@workspace/db";
import { countConfessionPages } from "./confessionImage";

const API = "https://graph.instagram.com/v23.0";

// 宣傳圖：放在網站的 public 資料夾，網址是 PUBLIC_URL + /promo-slide.jpg
// 想暫時關掉，在 Render 的環境變數加上 IG_PROMO_SLIDE=off
const PROMO_PATH = "/promo-slide.jpg";
const MAX_CAROUSEL_ITEMS = 10; // IG 輪播最多 10 張

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function igPost(path: string, params: Record<string, string>, token: string) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: token }),
  });
  const data: any = await r.json();
  if (!r.ok || data.error) {
    throw new Error(`Instagram API error: ${JSON.stringify(data.error ?? data)}`);
  }
  return data;
}

// 等 IG 處理完圖片（最多等約 20 秒）
async function waitForContainer(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const r = await fetch(
      `${API}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const s: any = await r.json();
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`Instagram container status: ${s.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export async function publishConfessionToInstagram(confessionId: number): Promise<string> {
  const igUserId = env("IG_USER_ID");
  const token = env("IG_ACCESS_TOKEN");
  const base = env("PUBLIC_URL").replace(/\/$/, "");

  const [post] = await db
    .select({ content: confessionsTable.content })
    .from(confessionsTable)
    .where(eq(confessionsTable.id, confessionId))
    .limit(1);
  if (!post) throw new Error(`Confession ${confessionId} not found`);

  const pages = countConfessionPages(post.content);
  const imageUrl = (page: number) =>
    `${base}/api/confession-image/${confessionId}.jpg${pages > 1 ? `?page=${page}` : ""}`;

  const caption = `This is unofficial account, all Website is Make by uniklMIIT Student.You can post on website and it will synchronized update to IG
      https://dream4u.my/
      FAQ Link at bio
      #Confession${confessionId}\n\n#WeAreunikl #ConfessionMIIT #ConfessionMIIT2026 #uniklmiit #unikl`;

  // 每一張圖的網址：告白的每一頁，最後再加一張宣傳圖（放不下 10 張就不加）
  const urls: string[] = [];
  for (let p = 1; p <= pages; p++) urls.push(imageUrl(p));
  const addPromo = process.env.IG_PROMO_SLIDE !== "off" && urls.length + 1 <= MAX_CAROUSEL_ITEMS;

  const createSingle = async (): Promise<string> => {
    const created = await igPost(
      `/${igUserId}/media`,
      { image_url: imageUrl(1), caption },
      token,
    );
    return created.id as string;
  };
  const createChild = async (url: string): Promise<string> => {
    const child = await igPost(
      `/${igUserId}/media`,
      { image_url: url, is_carousel_item: "true" },
      token,
    );
    return child.id as string;
  };

  let creationId: string;

  if (urls.length === 1 && !addPromo) {
    // 單張圖，而且不加宣傳圖
    creationId = await createSingle();
  } else {
    // 輪播：依序建立每一頁的子項目
    const childIds: string[] = [];
    for (const url of urls) childIds.push(await createChild(url));

    // 最後一張：宣傳圖。就算它失敗，告白本身也一定要發得出去
    if (addPromo) {
      try {
        const promoId = await createChild(`${base}${PROMO_PATH}`);
        await waitForContainer(promoId, token);
        childIds.push(promoId);
      } catch (err) {
        console.warn("[IG] Promo slide skipped:", err);
      }
    }

    if (childIds.length < 2) {
      // 只有一頁、宣傳圖又失敗：退回成單張圖
      creationId = await createSingle();
    } else {
      for (const id of childIds) await waitForContainer(id, token);
      const carousel = await igPost(
        `/${igUserId}/media`,
        { media_type: "CAROUSEL", children: childIds.join(","), caption },
        token,
      );
      creationId = carousel.id;
    }
  }

  await waitForContainer(creationId, token);

  const published = await igPost(`/${igUserId}/media_publish`, { creation_id: creationId }, token);
  return published.id as string;
}
