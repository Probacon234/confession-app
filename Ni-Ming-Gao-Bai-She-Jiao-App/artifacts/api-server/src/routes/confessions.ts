import {
  confessionsTable,
  bannedUsersTable,
  db,
  confessionCommentsTable,
  confessionLikesTable,
  announcementsTable,
  confessionReportsTable
} from "@workspace/db";
import { checkModerator } from "./moderation";
import { getAuth } from "@clerk/express";
import { publishConfessionToInstagram } from '../lib/instagram';
import { generateConfessionCard } from '../lib/cardGenerator';
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
import { updateUserActivity } from "./gamification";
import { createNotification as createNotificationFn } from "./notifications";

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
      authorId: confessionsTable.authorId,
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


// 使用者提交新告白貼文的路由
// 将第一参数改回 '/confessions'
router.post('/confessions', async (req, res): Promise<void> => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }
    const { content, category } = req.body;

    // ADMIN 分類：只有管理員能發（在後端驗證，不信任前端）
    const isAdminCategory =
      typeof category === "string" && category.trim().toLowerCase() === "admin";
    if (isAdminCategory) {
      const check = await checkModerator(userId);
      if (check !== "allowed") {
        res.status(check === "denied" ? 403 : 503).json({
          error: "Only admins can post in the ADMIN category",
        });
        return;
      }
    }

    // 1. 写入数据库
    const [newConfession] = await db.insert(confessionsTable).values({
      content,
      category: isAdminCategory ? "admin" : category || "all",
      authorId: userId,
      igStatus: "pending",
    }).returning();

    // 更新用戶活動統計（如果表存在）
    try {
      await updateUserActivity(userId, "confession");
    } catch (error) {
      console.error("Failed to record confession activity:", error);
    }

    // 2. 立即回應 201 給前端（極速體驗）
    res.status(201).json(newConfession);

    // 3. 背景異步發送到 Instagram
    publishConfessionToInstagram(newConfession.id)
      .then(async () => {
        console.log(`[IG Auto-Post] 贴文 #${newConfession.id} 已成功发布至 IG`);
        await db.update(confessionsTable)
          .set({ igStatus: 'published', igError: null })
          .where(eq(confessionsTable.id, newConfession.id));
      })
      .catch(async (igErr) => {
        console.error('[IG Auto-Post Failed]', igErr);
        await db.update(confessionsTable)
          .set({
            igStatus: 'failed',
            igError: igErr?.message || String(igErr)
          })
          .where(eq(confessionsTable.id, newConfession.id));
      });

    return;
  } catch (error) {
    console.error('Create confession error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '发文失败' });
    }
    return;
  }
  });

// 假設這是處理貼文的路由檔案
router.post("/confessions/:id/like", async (req, res): Promise<void> => {
  try {
    const confessionId = parseInt(req.params.id);
    
    // 🌟 1. 使用與 GET API 完全一致的方式取得 Clerk Auth userId
    const userId = getAuth(req).userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized: User not signed in" });
      return;
    }

    // 🌟 2. 檢查目前使用者是否已經點過讚
    const existingLike = await db
      .select()
      .from(confessionLikesTable)
      .where(
        and(
          eq(confessionLikesTable.confessionId, confessionId),
          eq(confessionLikesTable.userId, userId)
        )
      )
      .limit(1);

    let likedByMe = false;

    if (existingLike.length > 0) {
      // 已點讚 -> 刪除紀錄（取消讚）
      await db
        .delete(confessionLikesTable)
        .where(
          and(
            eq(confessionLikesTable.confessionId, confessionId),
            eq(confessionLikesTable.userId, userId)
          )
        );
      likedByMe = false;
    } else {
      // 未點讚 -> 新增點讚紀錄
      await db.insert(confessionLikesTable).values({
        confessionId,
        userId,
      });
      likedByMe = true;

      // 更新用戶活動統計
      await updateUserActivity(userId, "like_given");

      // 獲取告白作者並更新其統計
      const [confession] = await db
        .select({ authorId: confessionsTable.authorId })
        .from(confessionsTable)
        .where(eq(confessionsTable.id, confessionId))
        .limit(1);

      if (confession && confession.authorId !== userId) {
        await updateUserActivity(confession.authorId, "like_received");
        // 發送通知給告白作者
        await createNotificationFn(
          confession.authorId,
          "like",
          "Someone appreciates your words",
          "Your confession received a gentle nod of understanding.",
          confessionId,
        );
      }
    }

    // 🌟 3. 計算該貼文最新的總點讚數
    const [likeCountResult] = await db
      .select({ total: count() })
      .from(confessionLikesTable)
      .where(eq(confessionLikesTable.confessionId, confessionId));

    const likesCount = Number(likeCountResult?.total || 0);

    // 🌟 4. 回傳包含 likedByMe 與 likes 欄位的物件
    res.json({
      id: confessionId,
      likedByMe,
      likes: likesCount,
    });
  } catch (error) {
    console.error("Failed to toggle like:", error);
    res.status(500).json({ error: "Failed to toggle like" });
  }
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

  // 更新用戶活動統計
  await updateUserActivity(userId, "comment");

  // 發送通知給告白作者
  await createNotificationFn(
    confession.authorId,
    "comment_reply",
    "Someone left you a gentle word",
    "Your confession received a caring reply.",
    confession.id,
  );

  res.status(201).json(CreateConfessionCommentResponse.parse(created));
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

router.get("/confessions/:id", async (req, res): Promise<void> => {
  const confessionId = Number(req.params.id);
  if (isNaN(confessionId)) {
    res.status(400).json({ message: "Invalid confession ID" });
    return;
  }

  try {
    const [post] = await db
      .select()
      .from(confessionsTable)
      .where(eq(confessionsTable.id, confessionId))
      .limit(1);

    if (!post) {
      res.status(404).json({ message: "Confession post not found" });
      return;
    }

    res.json(post);
  } catch (error: any) {
    console.error("Failed to fetch confession:", error);
    res.status(500).json({ message: error?.message || "Internal server error" });
  }
});

// ==========================================
// 取得所有生效中的公告 (前台用)
// ==========================================
router.get("/announcements", async (req, res): Promise<void> => {
  try {
    const announcements = await db
      .select()
      .from(announcementsTable)
      .where(eq(announcementsTable.isActive, true))
      .orderBy(desc(announcementsTable.createdAt));

    res.json(announcements);
  } catch (error: any) {
    console.error("Failed to fetch announcements:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================
// 取得用戶自己的告白列表
// ==========================================
router.get("/my-confessions", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const myConfessions = await db
      .select({
        id: confessionsTable.id,
        content: confessionsTable.content,
        category: confessionsTable.category,
        createdAt: confessionsTable.createdAt,
        igStatus: confessionsTable.igStatus,
        igPostedAt: confessionsTable.igPostedAt,
      })
      .from(confessionsTable)
      .where(eq(confessionsTable.authorId, userId))
      .orderBy(desc(confessionsTable.createdAt));

    res.json(myConfessions);
  } catch (error: any) {
    console.error("Failed to fetch user confessions:", error);
    res.status(500).json({ error: "Failed to fetch confessions" });
  }
});

// ==========================================
// 編輯告白（時間限制：30分鐘內）
// ==========================================
router.put("/confessions/:id", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const confessionId = parseInt(req.params.id);
  if (isNaN(confessionId)) {
    res.status(400).json({ error: "Invalid confession ID" });
    return;
  }

  const { content, category } = req.body;

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  try {
    const [confession] = await db
      .select()
      .from(confessionsTable)
      .where(eq(confessionsTable.id, confessionId))
      .limit(1);

    if (!confession) {
      res.status(404).json({ error: "Confession not found" });
      return;
    }

    // 檢查是否為作者
    if (confession.authorId !== userId) {
      res.status(403).json({ error: "You can only edit your own confessions" });
      return;
    }

    // 檢查時間限制（30分鐘內）
    const createdAt = new Date(confession.createdAt);
    const now = new Date();
    const timeDiff = now.getTime() - createdAt.getTime();
    const thirtyMinutes = 30 * 60 * 1000;

    if (timeDiff > thirtyMinutes) {
      res.status(403).json({ error: "You can only edit confessions within 30 minutes of posting" });
      return;
    }

    // 更新告白
    const [updated] = await db
      .update(confessionsTable)
      .set({
        content: content.trim(),
        category: category || confession.category,
      })
      .where(eq(confessionsTable.id, confessionId))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("Failed to update confession:", error);
    res.status(500).json({ error: "Failed to update confession" });
  }
});

// ==========================================
// 用戶刪除自己的告白（只有作者本人；相關讚／留言／檢舉會一起被刪）
// ==========================================
router.delete("/confessions/:id", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const confessionId = Number(req.params.id);
  if (!Number.isInteger(confessionId) || confessionId <= 0) {
    res.status(400).json({ error: "Invalid confession ID" });
    return;
  }

  try {
    const [confession] = await db
      .select({ authorId: confessionsTable.authorId, igStatus: confessionsTable.igStatus })
      .from(confessionsTable)
      .where(eq(confessionsTable.id, confessionId))
      .limit(1);

    if (!confession) {
      res.status(404).json({ error: "Confession not found" });
      return;
    }
    if (confession.authorId !== userId) {
      res.status(403).json({ error: "You can only delete your own confessions" });
      return;
    }

    await db.delete(confessionsTable).where(eq(confessionsTable.id, confessionId));
    res.json({ success: true, onInstagram: confession.igStatus === "published" });
  } catch (error: any) {
    console.error("Failed to delete confession:", error);
    res.status(500).json({ error: "Failed to delete confession" });
  }
});

export default router;
