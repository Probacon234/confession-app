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
import {
  confessionCommentsTable,
  confessionLikesTable,
  confessionReportsTable,
  confessionsTable,
  db,
} from "@workspace/db";

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

  const parsed = CreateConfessionBody.safeParse(trimContent(req.body));
  if (!parsed.success) {
    sendValidationError(res, parsed.error.message);
    return;
  }

  const [created] = await db
    .insert(confessionsTable)
    .values({ ...parsed.data, authorId: userId })
    .returning({
      id: confessionsTable.id,
      content: confessionsTable.content,
      category: confessionsTable.category,
      createdAt: confessionsTable.createdAt,
    });

  res
    .status(201)
    .json(
      CreateConfessionResponse.parse(await confessionResponse(created, userId)),
    );
});

router.get("/confessions/:id", async (req, res): Promise<void> => {
  const parsed = GetConfessionParams.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.message);
    return;
  }

  const confession = await findConfession(parsed.data.id);
  if (!confession) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  res.json(
    GetConfessionResponse.parse(
      await confessionResponse(confession, getAuth(req).userId),
    ),
  );
});

router.post("/confessions/:id/like", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const parsed = ToggleConfessionLikeParams.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.message);
    return;
  }

  const confession = await findConfession(parsed.data.id);
  if (!confession) {
    res.status(404).json({ error: "Confession not found" });
    return;
  }

  const condition = and(
    eq(confessionLikesTable.confessionId, confession.id),
    eq(confessionLikesTable.userId, userId),
  );
  const [removed] = await db
    .delete(confessionLikesTable)
    .where(condition)
    .returning({ confessionId: confessionLikesTable.confessionId });

  let liked = false;
  if (!removed) {
    await db
      .insert(confessionLikesTable)
      .values({ confessionId: confession.id, userId })
      .onConflictDoNothing();
    liked = true;
  }
  const [likesResult] = await db
    .select({ value: count() })
    .from(confessionLikesTable)
    .where(eq(confessionLikesTable.confessionId, confession.id));

  res.json(
    ToggleConfessionLikeResponse.parse({
      liked,
      likes: likesResult.value,
    }),
  );
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

export default router;
