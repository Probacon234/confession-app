import { clerkClient, getAuth } from "@clerk/express";
import { count, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetModerationAccessResponse,
  ListModerationReportsQueryParams,
  ListModerationReportsResponse,
  UpdateModerationReportBody,
  UpdateModerationReportParams,
  UpdateModerationReportResponse,
} from "@workspace/api-zod";
import {
  confessionReportsTable,
  confessionsTable,
  db,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
type ModeratorCheck = "allowed" | "denied" | "unavailable";

async function checkModerator(userId: string): Promise<ModeratorCheck> {
  const allowedEmails = new Set(
    (process.env.CONFESSION_MODERATOR_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowedEmails.size === 0) return "unavailable";

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAllowed = user.emailAddresses.some(
      (address) =>
        address.verification?.status === "verified" &&
        allowedEmails.has(address.emailAddress.toLowerCase()),
    );
    return isAllowed ? "allowed" : "denied";
  } catch {
    logger.error("Unable to verify moderator identity with Clerk");
    return "unavailable";
  }
}

function reportSelection() {
  return {
    id: confessionReportsTable.id,
    confessionId: confessionReportsTable.confessionId,
    reason: confessionReportsTable.reason,
    details: confessionReportsTable.details,
    status: confessionReportsTable.status,
    reportedAt: confessionReportsTable.createdAt,
    confessionContent: confessionsTable.content,
    confessionCategory: confessionsTable.category,
    confessionCreatedAt: confessionsTable.createdAt,
  };
}

async function hasModeratorAccess(
  req: Request,
  res: Response,
): Promise<boolean> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return false;
  }

  const check = await checkModerator(userId);
  if (check === "unavailable") {
    res.status(503).json({ error: "Moderator access is temporarily unavailable" });
    return false;
  }
  if (check === "denied") {
    res.status(403).json({ error: "Moderator access required" });
    return false;
  }
  return true;
}

router.get("/moderation/access", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const check = await checkModerator(userId);
  if (check === "unavailable") {
    res.status(503).json({ error: "Moderator access is temporarily unavailable" });
    return;
  }

  let newReports = 0;
  if (check === "allowed") {
    const [{ value }] = await db
      .select({ value: count() })
      .from(confessionReportsTable)
      .where(eq(confessionReportsTable.status, "new"));
    newReports = value;
  }

  res.json(
    GetModerationAccessResponse.parse({
      allowed: check === "allowed",
      newReports,
    }),
  );
});

router.get("/moderation/reports", async (req, res): Promise<void> => {
  if (!(await hasModeratorAccess(req, res))) return;

  const parsed = ListModerationReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const statusFilter =
    parsed.data.status === "all"
      ? undefined
      : eq(confessionReportsTable.status, parsed.data.status);
  const reports = await db
    .select(reportSelection())
    .from(confessionReportsTable)
    .innerJoin(
      confessionsTable,
      eq(confessionReportsTable.confessionId, confessionsTable.id),
    )
    .where(statusFilter)
    .orderBy(desc(confessionReportsTable.createdAt), desc(confessionReportsTable.id));

  res.json(ListModerationReportsResponse.parse(reports));
});

router.patch("/moderation/reports/:reportId", async (req, res): Promise<void> => {
  if (!(await hasModeratorAccess(req, res))) return;

  const params = UpdateModerationReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateModerationReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(confessionReportsTable)
    .set({ status: parsed.data.status })
    .where(eq(confessionReportsTable.id, params.data.reportId))
    .returning({ id: confessionReportsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const [report] = await db
    .select(reportSelection())
    .from(confessionReportsTable)
    .innerJoin(
      confessionsTable,
      eq(confessionReportsTable.confessionId, confessionsTable.id),
    )
    .where(eq(confessionReportsTable.id, updated.id));

  res.json(UpdateModerationReportResponse.parse(report));
});

// 1. Delete confession post by ID
// Delete confession post by ID
router.delete("/confessions/:id", async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const postId = Number(req.params.id);
  if (isNaN(postId)) {
    return res.status(400).json({ message: "Invalid post ID" });
  }

  try {
    // Delete target confession from database
    await db.delete(confessionsTable).where(eq(confessionsTable.id, postId));

    // Mark corresponding reports as resolved
    await db
      .update(confessionReportsTable)
      .set({ status: "resolved" })
      .where(eq(confessionReportsTable.confessionId, postId));

    return res.json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    logger.error({ error }, "Failed to delete post");
    return res.status(500).json({ message: "Failed to delete post" });
  }
});

const handleDeleteConfession = async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ message: "Unauthorized: Please log in." });
  }

  const postId = Number(req.params.id);
  if (isNaN(postId)) {
    return res.status(400).json({ message: "Invalid post ID" });
  }

  try {
    await db.transaction(async (tx) => {
      // 1. 先清理举报记录
      await tx
        .delete(confessionReportsTable)
        .where(eq(confessionReportsTable.confessionId, postId));

      // 2. 如果你的 schema 里有评论表或点赞表，请取消对应注释并添加：
      // await tx.delete(confessionCommentsTable).where(eq(confessionCommentsTable.confessionId, postId));
      // await tx.delete(confessionLikesTable).where(eq(confessionLikesTable.confessionId, postId));

      // 3. 最后删除告白贴文主记录
      await tx
        .delete(confessionsTable)
        .where(eq(confessionsTable.id, postId));
    });

    return res.json({ success: true, message: "Post deleted successfully" });
  } catch (error: any) {
    logger.error({ error, postId }, "Failed to delete post inside transaction");
    return res.status(500).json({ 
      message: error?.message || error?.detail || "Database cascade delete failed." 
    });
  }
};

// 注册路由接口
router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

// Register routes
router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

// Register routes for both endpoints
router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

// Ban user via Clerk Server SDK (Supports lookup by confessionId)
router.post("/users/ban", async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // 1. 接收前端傳來的 confessionId 或 userId
  const { confessionId, userId } = req.body;

  if (!confessionId && !userId) {
    return res.status(400).json({ message: "Missing confessionId or userId in request body" });
  }

  try {
    let targetUserId = userId;

    // 2. 如果前端傳的是 confessionId，就去資料庫把這個匿名作者的真實 ID 抓出來
    if (confessionId) {
      const post = await db
        .select()
        .from(confessionsTable)
        .where(eq(confessionsTable.id, Number(confessionId)))
        .limit(1);

      if (post.length === 0) {
        return res.status(404).json({ message: "Confession post not found in database" });
      }

      // 嘗試獲取資料庫中紀錄作者的欄位 (通常是 authorId, userId 或 clerkId)
      // 直接使用数据库中实际存在的 authorId 字段
    targetUserId = post[0].authorId;
    }

    // 如果資料庫裡也沒有這個人的 ID (例如舊資料沒存)
    if (!targetUserId) {
      return res.status(404).json({ message: "Cannot ban: Author ID is missing in the database record." });
    }

    // 3. 呼叫 Clerk SDK 正式封鎖該用戶
    await clerkClient.users.banUser(targetUserId);

    return res.json({ success: true, message: "User banned successfully" });
  } catch (error: any) {
    logger.error({ error }, "Failed to ban user");
    return res.status(500).json({ message: error?.message || "Failed to ban user due to server error" });
  }
});

export default router;