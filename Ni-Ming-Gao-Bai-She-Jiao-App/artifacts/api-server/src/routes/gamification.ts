import {
  userStatsTable,
  badgesTable,
  userBadgesTable,
  dailyTasksTable,
  userDailyTasksTable,
  db,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
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

// 獲取用戶統計數據
router.get("/gamification/stats", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    let [stats] = await db
      .select()
      .from(userStatsTable)
      .where(eq(userStatsTable.userId, userId))
      .limit(1);

    // 如果用戶沒有統計記錄，創建一個
    if (!stats) {
      const [newStats] = await db
        .insert(userStatsTable)
        .values({ userId })
        .returning();
      stats = newStats;
    }

    res.json(stats);
  } catch (error: any) {
    console.error("Failed to fetch user stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// 獲取用戶的徽章
router.get("/gamification/badges", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const userBadges = await db
      .select({
        id: badgesTable.id,
        name: badgesTable.name,
        description: badgesTable.description,
        icon: badgesTable.icon,
        requirementType: badgesTable.requirementType,
        requirementValue: badgesTable.requirementValue,
        earnedAt: userBadgesTable.earnedAt,
      })
      .from(userBadgesTable)
      .innerJoin(badgesTable, eq(userBadgesTable.badgeId, badgesTable.id))
      .where(eq(userBadgesTable.userId, userId))
      .orderBy(desc(userBadgesTable.earnedAt));

    res.json(userBadges);
  } catch (error: any) {
    console.error("Failed to fetch user badges:", error);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// 獲取所有可用的徽章（包括未獲得的）
router.get("/gamification/badges/all", async (req, res): Promise<void> => {
  try {
    const userId = getAuth(req).userId;
    const allBadges = await db.select().from(badgesTable);

    if (userId) {
      const earnedBadgeIds = await db
        .select({ badgeId: userBadgesTable.badgeId })
        .from(userBadgesTable)
        .where(eq(userBadgesTable.userId, userId));

      const earnedIds = new Set(earnedBadgeIds.map((b) => b.badgeId));

      const badgesWithStatus = allBadges.map((badge) => ({
        ...badge,
        earned: earnedIds.has(badge.id),
      }));

      res.json(badgesWithStatus);
    } else {
      res.json(allBadges.map((badge) => ({ ...badge, earned: false })));
    }
  } catch (error: any) {
    console.error("Failed to fetch all badges:", error);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// 獲取每日任務
router.get("/gamification/daily-tasks", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const today = new Date().toISOString().split("T")[0];

    const tasks = await db
      .select({
        id: dailyTasksTable.id,
        name: dailyTasksTable.name,
        description: dailyTasksTable.description,
        taskType: dailyTasksTable.taskType,
        targetCount: dailyTasksTable.targetCount,
        xpReward: dailyTasksTable.xpReward,
        progress: userDailyTasksTable.progress,
        completed: userDailyTasksTable.completed,
        completedAt: userDailyTasksTable.completedAt,
      })
      .from(dailyTasksTable)
      .leftJoin(
        userDailyTasksTable,
        and(
          eq(userDailyTasksTable.taskId, dailyTasksTable.id),
          eq(userDailyTasksTable.userId, userId),
          eq(userDailyTasksTable.date, today),
        ),
      )
      .where(eq(dailyTasksTable.isActive, true));

    // 初始化未開始的任務
    for (const task of tasks) {
      if (!task.progress) {
        await db.insert(userDailyTasksTable).values({
          userId,
          taskId: task.id,
          progress: 0,
          completed: false,
          date: today,
        });
        task.progress = 0;
        task.completed = false;
      }
    }

    res.json(tasks);
  } catch (error: any) {
    console.error("Failed to fetch daily tasks:", error);
    res.status(500).json({ error: "Failed to fetch daily tasks" });
  }
});

// 更新任務進度
router.post("/gamification/daily-tasks/:taskId/progress", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) {
    res.status(400).json({ error: "Invalid task ID" });
    return;
  }

  const { increment } = req.body;
  const incrementValue = typeof increment === "number" ? increment : 1;

  try {
    const today = new Date().toISOString().split("T")[0];

    const [userTask] = await db
      .select()
      .from(userDailyTasksTable)
      .where(
        and(
          eq(userDailyTasksTable.userId, userId),
          eq(userDailyTasksTable.taskId, taskId),
          eq(userDailyTasksTable.date, today),
        ),
      )
      .limit(1);

    if (!userTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const newProgress = Math.min(userTask.progress + incrementValue, userTask.targetCount);
    const completed = newProgress >= userTask.targetCount && !userTask.completed;

    await db
      .update(userDailyTasksTable)
      .set({
        progress: newProgress,
        completed,
        completedAt: completed ? new Date() : userTask.completedAt,
      })
      .where(eq(userDailyTasksTable.id, userTask.id));

    // 如果任務完成，獎勵 XP
    if (completed && !userTask.completed) {
      await addXP(userId, userTask.xpReward);
    }

    res.json({ progress: newProgress, completed });
  } catch (error: any) {
    console.error("Failed to update task progress:", error);
    res.status(500).json({ error: "Failed to update progress" });
  }
});

// 輔助函數：添加 XP 並檢查升級
async function addXP(userId: string, xpAmount: number) {
  const [stats] = await db
    .select()
    .from(userStatsTable)
    .where(eq(userStatsTable.userId, userId))
    .limit(1);

  if (!stats) return;

  const newXP = stats.xp + xpAmount;
  const newLevel = calculateLevel(newXP);

  await db
    .update(userStatsTable)
    .set({ xp: newXP, level: newLevel })
    .where(eq(userStatsTable.userId, userId));

  // 檢查是否升級，如果是則可以發送通知
  if (newLevel > stats.level) {
    // TODO: 發送升級通知
    console.log(`User ${userId} leveled up to ${newLevel}!`);
  }
}

// 輔助函數：根據 XP 計算等級
function calculateLevel(xp: number): number {
  // 簡單的等級公式：每個等級需要 level * 100 XP
  // Level 1: 0-99 XP
  // Level 2: 100-299 XP
  // Level 3: 300-599 XP
  // ...
  let level = 1;
  let xpNeeded = 0;
  while (xp >= xpNeeded) {
    level++;
    xpNeeded += level * 100;
  }
  return level - 1;
}

// 輔助函數：更新用戶活動統計
export async function updateUserActivity(
  userId: string,
  type: "confession" | "comment" | "like_given" | "like_received",
) {
  const [stats] = await db
    .select()
    .from(userStatsTable)
    .where(eq(userStatsTable.userId, userId))
    .limit(1);

  if (!stats) {
    await db.insert(userStatsTable).values({ userId });
    return;
  }

  const updates: any = {
    lastActiveAt: new Date(),
  };

  const today = new Date().toISOString().split("T")[0];
  const lastActivityDate = stats.lastActivityDate
    ? new Date(stats.lastActivityDate).toISOString().split("T")[0]
    : null;

  // 計算連續天數
  if (lastActivityDate === today) {
    // 今天已經活動過，不變
  } else if (lastActivityDate === getYesterday()) {
    // 昨天活動過，連續天數 +1
    updates.streakDays = stats.streakDays + 1;
  } else {
    // 連續中斷，重置為 1
    updates.streakDays = 1;
  }
  updates.lastActivityDate = today;

  switch (type) {
    case "confession":
      updates.totalConfessions = stats.totalConfessions + 1;
      break;
    case "comment":
      updates.totalComments = stats.totalComments + 1;
      break;
    case "like_given":
      updates.totalLikesGiven = stats.totalLikesGiven + 1;
      break;
    case "like_received":
      updates.totalLikesReceived = stats.totalLikesReceived + 1;
      break;
  }

  await db
    .update(userStatsTable)
    .set(updates)
    .where(eq(userStatsTable.userId, userId));

  // 檢查是否獲得新徽章
  await checkAndAwardBadges(userId);
}

// 輔助函數：檢查並頒發徽章
async function checkAndAwardBadges(userId: string) {
  const [stats] = await db
    .select()
    .from(userStatsTable)
    .where(eq(userStatsTable.userId, userId))
    .limit(1);

  if (!stats) return;

  const allBadges = await db.select().from(badgesTable);
  const earnedBadgeIds = await db
    .select({ badgeId: userBadgesTable.badgeId })
    .from(userBadgesTable)
    .where(eq(userBadgesTable.userId, userId));

  const earnedIds = new Set(earnedBadgeIds.map((b) => b.badgeId));

  for (const badge of allBadges) {
    if (earnedIds.has(badge.id)) continue;

    let qualified = false;
    switch (badge.requirementType) {
      case "confessions":
        qualified = stats.totalConfessions >= badge.requirementValue;
        break;
      case "comments":
        qualified = stats.totalComments >= badge.requirementValue;
        break;
      case "likes":
        qualified = stats.totalLikesReceived >= badge.requirementValue;
        break;
      case "streak":
        qualified = stats.streakDays >= badge.requirementValue;
        break;
    }

    if (qualified) {
      await db.insert(userBadgesTable).values({
        userId,
        badgeId: badge.id,
      });
      console.log(`User ${userId} earned badge: ${badge.name}`);
      // TODO: 發送徽章獲得通知
    }
  }
}

function getYesterday(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
}

export default router;
