import { 
  confessionsTable, 
  bannedUsersTable, 
  db, 
  confessionCommentsTable, 
  confessionLikesTable, 
  confessionReportsTable 
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateConfessionBody,
  CreateConfessionCommentBody,
  CreateConfessionCommentParams,
  CreateConfessionCommentResponse,
  CreateConfessionResponse,
  GetConfessionParams,
  GetConfessionResponse,
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

const router: IRouter = Router();

function requireUserId(req: Request, res: Response): string | null {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return null;
  }
  return userId;
}

function trimContent(body: unknown): unknown {
  if (
    typeof body === "object" &&
    body !== null &&
    "content" in body &&
    typeof body.content === "string"
  ) {
    return { ...body, content: body.content.trim() };
  }
  return body;
}

async function findConfession(id: number) {
  const [confession] = await db
    .select({
      id: confessionsTable.id,
      content: confessionsTable.content,
      category: confessionsTable.category,
      createdAt: confessionsTable.createdAt,
    })
    .from(confessionsTable)
    .where(eq(confessionsTable.id, id));

  return confession ?? null;
}

async function getEngagement(
  confessionId: number,
  userId: string | null,
): Promise<{ likes: number; commentsCount: number; likedByMe: boolean }> {
  const [likesResult, commentsResult, userLike] = await Promise.all([
    db
      .select({ value: count() })
      .from(confessionLikesTable)
      .where(eq(confessionLikesTable.confessionId, confessionId)),
    db
      .select({ value: count() })
      .from(confessionCommentsTable)
      .where(eq(confessionCommentsTable.confessionId, confessionId)),
    userId
      ? db
          .select({ confessionId: confessionLikesTable.confessionId })
          .from(confessionLikesTable)
          .where(
            and(
              eq(confessionLikesTable.confessionId, confessionId),
              eq(confessionLikesTable.userId, userId),
            ),
          )
      : Promise.resolve([]),
  ]);

  return {
    likes: likesResult[0].value,
    commentsCount: commentsResult[0].value,
    likedByMe: userLike.length > 0,
  };
}

async function confessionResponse(
  confession: NonNullable<Awaited<ReturnType<typeof findConfession>>>,
  userId: string | null,
) {
  return { ...confession, ...(await getEngagement(confession.id, userId)) };
}

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

router.get("/confessions", async (req, res): Promise<void> => {
  const parsed = ListConfessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.message);
    return;
  }

  const likesByConfession = db
    .select({
      confessionId: confessionLikesTable.confessionId,
      total: count().as("likes_count"),
    })
    .from(confessionLikesTable)
    .groupBy(confessionLikesTable.confessionId)
    .as("likes_by_confession");
  const commentsByConfession = db
    .select({
      confessionId: confessionCommentsTable.confessionId,
      total: count().as("comments_count"),
    })
    .from(confessionCommentsTable)
    .groupBy(confessionCommentsTable.confessionId)
    .as("comments_by_confession");

  const rows = await db
    .select({
      id: confessionsTable.id,
      content: confessionsTable.content,
      category: confessionsTable.category,
      createdAt: confessionsTable.createdAt,
      likes: sql<number>`coalesce("likes_by_confession"."likes_count", 0)::int`,
      commentsCount: sql<number>`coalesce("comments_by_confession"."comments_count", 0)::int`,
    })
    .from(confessionsTable)
    .leftJoin(
      likesByConfession,
      eq(likesByConfession.confessionId, confessionsTable.id),
    )
    .leftJoin(
      commentsByConfession,
      eq(commentsByConfession.confessionId, confessionsTable.id),
    )
    .where(
      parsed.data.category
        ? eq(confessionsTable.category, parsed.data.category)
        : undefined,
    )
    .orderBy(
      parsed.data.sort === "popular"
        ? desc(sql`coalesce(${likesByConfession.total}, 0)`)
        : desc(confessionsTable.createdAt),
      desc(confessionsTable.createdAt),
      desc(confessionsTable.id),
    );

  const userId = getAuth(req).userId;
  const likedConfessionIds =
    userId && rows.length > 0
      ? await db
          .select({ confessionId: confessionLikesTable.confessionId })
          .from(confessionLikesTable)
          .where(
            and(
              eq(confessionLikesTable.userId, userId),
              inArray(
                confessionLikesTable.confessionId,
                rows.map((row) => row.id),
              ),
            ),
          )
      : [];
  const likedIds = new Set(likedConfessionIds.map((like) => like.confessionId));

  res.json(
    ListConfessionsResponse.parse(
      rows.map((row) => ({
        ...row,
        likedByMe: likedIds.has(row.id),
      })),
    ),
  );
});


router.post("/confessions", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  // 1. 檢查該使用者是否在自建黑名單內
  try {
    const bannedRecord = await db
      .select()
      .from(bannedUsersTable)
      .where(eq(bannedUsersTable.userId, userId))
      .limit(1);

    if (bannedRecord.length > 0) {
      res.status(403).json({ message: "You have been banned from posting confessions." });
      return;
    }
  } catch (err) {
    console.error("Error checking ban status:", err);
  }

  // 2. 正常發文邏輯
  try {
    const { content, category } = req.body;
    if (!content) {
      res.status(400).json({ message: "Content is required" });
      return;
    }

    const [newPost] = await db
      .insert(confessionsTable)
      .values({
        content,
        category: category || "life",
        authorId: userId,
      })
      .returning();

    res.status(201).json(newPost);
  } catch (error: any) {
    console.error("Failed to create confession:", error);
    res.status(500).json({ message: error?.message || "Internal server error" });
  }
});

router.get("/confessions/:id/comments", async (req, res): Promise<void> => {
  const parsed = ListConfessionCommentsParams.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.message);
    return;
  }

  const confession = await findConfession(parsed.data.id);
  if (!confession) {
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
    .where(eq(confessionCommentsTable.confessionId, confession.id))
    .orderBy(confessionCommentsTable.createdAt, confessionCommentsTable.id);

  res.json(ListConfessionCommentsResponse.parse(comments));
});

router.post("/confessions/:id/comments", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const params = CreateConfessionCommentParams.safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error.message);
    return;
  }
  const body = CreateConfessionCommentBody.safeParse(trimContent(req.body));
  if (!body.success) {
    sendValidationError(res, body.error.message);
    return;
  }

  const confession = await findConfession(params.data.id);
  if (!confession) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  const [created] = await db
    .insert(confessionCommentsTable)
    .values({
      confessionId: confession.id,
      content: body.data.content,
      authorId: userId,
    })
    .returning({
      id: confessionCommentsTable.id,
      confessionId: confessionCommentsTable.confessionId,
      content: confessionCommentsTable.content,
      createdAt: confessionCommentsTable.createdAt,
    });

  res.status(201).json(CreateConfessionCommentResponse.parse(created));
});

router.post("/confessions/:id/reports", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const params = ReportConfessionParams.safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error.message);
    return;
  }
  const body = ReportConfessionBody.safeParse(req.body);
  if (!body.success) {
    sendValidationError(res, body.error.message);
    return;
  }

  const confession = await findConfession(params.data.id);
  if (!confession) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  await db
    .insert(confessionReportsTable)
    .values({
      confessionId: confession.id,
      userId,
      reason: body.data.reason,
      details: body.data.details?.trim() || null,
    })
    .onConflictDoNothing();

  res.status(201).json(ReportConfessionResponse.parse({ success: true }));
});


router.get("/community/summary", async (req: Request, res: Response): Promise<void> => {
  try {
    const [{ totalConfessions }] = await db
      .select({ totalConfessions: count() })
      .from(confessionsTable);

    const [{ totalLikes }] = await db
      .select({ totalLikes: count() })
      .from(confessionLikesTable);

    const [{ totalComments }] = await db
      .select({ totalComments: count() })
      .from(confessionCommentsTable);

    res.json({
      totalConfessions: Number(totalConfessions || 0),
      totalLikes: Number(totalLikes || 0),
      totalComments: Number(totalComments || 0),
      pulse: "active",
    });
  } catch (error) {
    console.error("Error fetching community summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});


import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export default router;
