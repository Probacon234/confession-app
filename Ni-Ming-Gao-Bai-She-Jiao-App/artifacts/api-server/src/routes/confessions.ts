import { getAuth } from "@clerk/express";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateConfessionBody,
  CreateConfessionCommentBody,
  CreateConfessionCommentParams,
  CreateConfessionCommentResponse,
  CreateConfessionResponse,
  GetConfessionParams,
  GetConfessionResponse,
  GetCommunitySummaryResponse,
  ListConfessionCommentsParams,
  ListConfessionCommentsResponse,
  ListConfessionsQueryParams,
  ListConfessionsResponse,
  ReportConfessionBody,
  ReportConfessionParams,
  ReportConfessionResponse,
  ToggleConfessionLikeParams,
  ToggleConfessionLikeResponse,
} from "@workspace/api-zod";
import {
  confessionCommentsTable,
  confessionLikesTable,
  confessionReportsTable,
  confessionsTable,
  db,
} from "@workspace/db";

const router: IRouter = Router();
type ConfessionRow = typeof confessionsTable.$inferSelect;
const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function userIdFor(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

function requireUserId(req: Request, res: Response): string | null {
  const userId = userIdFor(req);
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return null;
  }
  return userId;
}

function confessionIdParam(req: Request): unknown {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

async function formatConfessions(
  rows: ConfessionRow[],
  viewerId: string | null,
) {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [likeCounts, commentCounts, viewerLikes] = await Promise.all([
    db
      .select({
        confessionId: confessionLikesTable.confessionId,
        total: count(),
      })
      .from(confessionLikesTable)
      .where(inArray(confessionLikesTable.confessionId, ids))
      .groupBy(confessionLikesTable.confessionId),
    db
      .select({
        confessionId: confessionCommentsTable.confessionId,
        total: count(),
      })
      .from(confessionCommentsTable)
      .where(inArray(confessionCommentsTable.confessionId, ids))
      .groupBy(confessionCommentsTable.confessionId),
    viewerId
      ? db
          .select({ confessionId: confessionLikesTable.confessionId })
          .from(confessionLikesTable)
          .where(
            and(
              inArray(confessionLikesTable.confessionId, ids),
              eq(confessionLikesTable.userId, viewerId),
            ),
          )
      : Promise.resolve([]),
  ]);

  const likesByConfession = new Map(
    likeCounts.map((item) => [item.confessionId, item.total]),
  );
  const commentsByConfession = new Map(
    commentCounts.map((item) => [item.confessionId, item.total]),
  );
  const likedIds = new Set(viewerLikes.map((item) => item.confessionId));

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category as
      "love" | "friendship" | "family" | "school" | "work" | "life",
    createdAt: row.createdAt,
    likes: likesByConfession.get(row.id) ?? 0,
    commentsCount: commentsByConfession.get(row.id) ?? 0,
    likedByMe: likedIds.has(row.id),
  }));
}

async function findConfession(id: number): Promise<ConfessionRow | undefined> {
  const [row] = await db
    .select()
    .from(confessionsTable)
    .where(eq(confessionsTable.id, id))
    .limit(1);
  return row;
}

router.get("/confessions", async (req, res): Promise<void> => {
  const parsed = ListConfessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filters = parsed.data.category
    ? eq(confessionsTable.category, parsed.data.category)
    : undefined;
  const rows =
    parsed.data.sort === "popular"
      ? await db
          .select()
          .from(confessionsTable)
          .where(filters)
          .orderBy(
            desc(
              sql`(select count(*) from ${confessionLikesTable} where ${confessionLikesTable.confessionId} = ${confessionsTable.id}) + (select count(*) from ${confessionCommentsTable} where ${confessionCommentsTable.confessionId} = ${confessionsTable.id})`,
            ),
            desc(confessionsTable.createdAt),
          )
          .limit(60)
      : await db
          .select()
          .from(confessionsTable)
          .where(filters)
          .orderBy(desc(confessionsTable.createdAt))
          .limit(60);
  const confessions = await formatConfessions(rows, userIdFor(req));
  res.json(ListConfessionsResponse.parse(confessions));
});

router.post("/confessions", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const parsed = CreateConfessionBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.content.trim()) {
    res.status(400).json({
      error: parsed.success
        ? "Confession content cannot be blank"
        : parsed.error.message,
    });
    return;
  }

  const [row] = await db
    .insert(confessionsTable)
    .values({
      content: parsed.data.content.trim(),
      category: parsed.data.category,
      authorId: userId,
    })
    .returning();
  const [confession] = await formatConfessions([row], userId);
  res.status(201).json(CreateConfessionResponse.parse(confession));
});

router.get("/confessions/:id", async (req, res): Promise<void> => {
  const params = GetConfessionParams.safeParse({ id: confessionIdParam(req) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const row = await findConfession(params.data.id);
  if (!row) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  const [confession] = await formatConfessions([row], userIdFor(req));
  res.json(GetConfessionResponse.parse(confession));
});

router.post("/confessions/:id/like", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const params = ToggleConfessionLikeParams.safeParse({
    id: confessionIdParam(req),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await findConfession(params.data.id))) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  const condition = and(
    eq(confessionLikesTable.confessionId, params.data.id),
    eq(confessionLikesTable.userId, userId),
  );
  const [existing] = await db
    .select()
    .from(confessionLikesTable)
    .where(condition)
    .limit(1);
  if (existing) {
    await db.delete(confessionLikesTable).where(condition);
  } else {
    await db
      .insert(confessionLikesTable)
      .values({ confessionId: params.data.id, userId })
      .onConflictDoNothing();
  }

  const [total] = await db
    .select({ value: count() })
    .from(confessionLikesTable)
    .where(eq(confessionLikesTable.confessionId, params.data.id));
  res.json(
    ToggleConfessionLikeResponse.parse({
      liked: !existing,
      likes: total.value,
    }),
  );
});

router.get("/confessions/:id/comments", async (req, res): Promise<void> => {
  const params = CreateConfessionCommentParams.safeParse({
    id: confessionIdParam(req),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await findConfession(params.data.id))) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  const comments = await db
    .select({
      id: confessionCommentsTable.id,
      confessionId: confessionCommentsTable.confessionId,
      content: confessionCommentsTable.content,
      createdAt: confessionCommentsTable.createdAt,
    })
    .from(confessionCommentsTable)
    .where(eq(confessionCommentsTable.confessionId, params.data.id))
    .orderBy(desc(confessionCommentsTable.createdAt))
    .limit(100);
  res.json(ListConfessionCommentsResponse.parse(comments));
});

router.post("/confessions/:id/comments", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const params = ListConfessionCommentsParams.safeParse({
    id: confessionIdParam(req),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateConfessionCommentBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.content.trim()) {
    res.status(400).json({
      error: parsed.success ? "Comment cannot be blank" : parsed.error.message,
    });
    return;
  }

  if (!(await findConfession(params.data.id))) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }
  const [comment] = await db
    .insert(confessionCommentsTable)
    .values({
      confessionId: params.data.id,
      content: parsed.data.content.trim(),
      authorId: userId,
    })
    .returning({
      id: confessionCommentsTable.id,
      confessionId: confessionCommentsTable.confessionId,
      content: confessionCommentsTable.content,
      createdAt: confessionCommentsTable.createdAt,
    });
  res.status(201).json(CreateConfessionCommentResponse.parse(comment));
});

router.post("/confessions/:id/reports", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const params = ReportConfessionParams.safeParse({
    id: confessionIdParam(req),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ReportConfessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await findConfession(params.data.id))) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  await db
    .insert(confessionReportsTable)
    .values({
      confessionId: params.data.id,
      userId,
      reason: parsed.data.reason,
      details: parsed.data.details?.trim() || null,
    })
    .onConflictDoNothing();
  res.status(201).json(ReportConfessionResponse.parse({ success: true }));
});

router.get("/community/summary", async (_req, res): Promise<void> => {
  const nowInMalaysia = new Date(Date.now() + MALAYSIA_UTC_OFFSET_MS);
  const midnightUtc = new Date(
    Date.UTC(
      nowInMalaysia.getUTCFullYear(),
      nowInMalaysia.getUTCMonth(),
      nowInMalaysia.getUTCDate(),
    ) - MALAYSIA_UTC_OFFSET_MS,
  );
  const [[confessionTotal], [todayTotal], [likeTotal]] = await Promise.all([
    db.select({ value: count() }).from(confessionsTable),
    db
      .select({ value: count() })
      .from(confessionsTable)
      .where(gte(confessionsTable.createdAt, midnightUtc)),
    db.select({ value: count() }).from(confessionLikesTable),
  ]);
  res.json(
    GetCommunitySummaryResponse.parse({
      totalConfessions: confessionTotal.value,
      confessionsToday: todayTotal.value,
      totalLikes: likeTotal.value,
    }),
  );
});

export default router;
