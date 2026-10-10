import { eq } from "drizzle-orm";
import { confessionsTable, db } from "@workspace/db";
import { countConfessionPages } from "./confessionImage";

const API = "https://graph.instagram.com/v23.0";

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
      FAQ Link at below
      https://docs.google.com/document/d/1QD_jZMU0uUYMhxdyYMvWNroOYCUCNmTkLOs7sT0Y_CY/edit?tab=t.0
      #Confession${confessionId}\n\n#WeAreunikl #ConfessionMIIT #ConfessionMIIT2026 #uniklmiit #unikl`;

  let creationId: string;

  if (pages <= 1) {
    // 單張圖
    const created = await igPost(
      `/${igUserId}/media`,
      { image_url: imageUrl(1), caption },
      token,
    );
    creationId = created.id;
  } else {
    // 輪播：每一頁各建一個子項目（依頁碼順序）
    const childIds: string[] = [];
    for (let p = 1; p <= pages; p++) {
      const child = await igPost(
        `/${igUserId}/media`,
        { image_url: imageUrl(p), is_carousel_item: "true" },
        token,
      );
      childIds.push(child.id);
    }
    for (const id of childIds) await waitForContainer(id, token);

    const carousel = await igPost(
      `/${igUserId}/media`,
      { media_type: "CAROUSEL", children: childIds.join(","), caption },
      token,
    );
    creationId = carousel.id;
  }

  await waitForContainer(creationId, token);

  const published = await igPost(`/${igUserId}/media_publish`, { creation_id: creationId }, token);
  return published.id as string;
}