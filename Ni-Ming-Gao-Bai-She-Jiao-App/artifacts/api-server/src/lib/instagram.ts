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

export async function publishConfessionToInstagram(confessionId: number): Promise<string> {
  const igUserId = env("IG_USER_ID");
  const token = env("IG_ACCESS_TOKEN");
  const base = env("PUBLIC_URL").replace(/\/$/, "");

  const created = await igPost(
    `/${igUserId}/media`,
    {
      image_url: `${base}/api/confession-image/${confessionId}.jpg`,
      caption: `#Confession${confessionId}\n\n#WeAreunikl #ConfessionMIIT #ConfessionMIIT2026`,
    },
    token,
  );

  for (let i = 0; i < 10; i++) {
    const r = await fetch(
      `${API}/${created.id}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const s: any = await r.json();
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`Instagram container status: ${s.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const published = await igPost(`/${igUserId}/media_publish`, { creation_id: created.id }, token);
  return published.id as string;
}