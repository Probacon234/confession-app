import {
  notificationsTable,
  db,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

function requireUserId(req: Request, res: Response): string | null {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return null;
  }
  return userId;
}

// 獲取用戶的通知
router.get("/notifications", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);

    res.json(notifications);
  } catch (error: any) {
    console.error("Failed to fetch notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// 獲取未讀通知數量
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const [result] = await db
      .select({ count: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.read, false),
        ),
      );

    res.json({ count: result ? 1 : 0 });
  } catch (error: any) {
    console.error("Failed to fetch unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// 標記通知為已讀
router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const notificationId = parseInt(req.params.id);
  if (isNaN(notificationId)) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.userId, userId),
        ),
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Failed to mark notification as read:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// 標記所有通知為已讀
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, userId));

    res.json({ success: true });
  } catch (error: any) {
    console.error("Failed to mark all notifications as read:", error);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// 創建通知（輔助函數，供其他路由調用）
export async function createNotification(
  userId: string,
  type: "comment_reply" | "like" | "badge_earned" | "level_up",
  title: string,
  message: string,
  relatedId?: number,
) {
  try {
    await db.insert(notificationsTable).values({
      userId,
      type,
      title,
      message,
      relatedId,
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

export default router;
