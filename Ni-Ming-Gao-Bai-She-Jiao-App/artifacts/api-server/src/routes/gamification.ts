import {
  confessionCommentsTable,
  confessionLikesTable,
  confessionsTable,
  userStatsTable,
  badgesTable,
  userBadgesTable,
  dailyTasksTable,
  userDailyTasksTable,
  db,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { createNotification } from "./notifications";

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
router.get("/stats", async (req, res): Promise<void> => {
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

    const [confessions, comments, likesGiven, likesReceived] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(confessionsTable)
          .where(eq(confessionsTable.authorId, userId)),
        db
          .select({ value: count() })
          .from(confessionCommentsTable)
          .where(eq(confessionCommentsTable.authorId, userId)),
        db
          .select({ value: count() })
          .from(confessionLikesTable)
          .where(eq(confessionLikesTable.userId, userId)),
        db
          .select({ value: count() })
          .from(confessionLikesTable)
          .innerJoin(
            confessionsTable,
            eq(confessionLikesTable.confessionId, confessionsTable.id),
          )
          .where(eq(confessionsTable.authorId, userId)),
      ]);
    const [updatedStats] = await db
      .update(userStatsTable)
      .set({
        totalConfessions: confessions[0].value,
        totalComments: comments[0].value,
        totalLikesGiven: likesGiven[0].value,
        totalLikesReceived: likesReceived[0].value,
      })
      .where(eq(userStatsTable.userId, userId))
      .returning();
    stats = updatedStats;
    await checkAndAwardBadges(userId);

    res.json(stats);
  } catch (error: any) {
    console.error("Failed to fetch user stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// 獲取用戶的徽章
router.get("/badges", async (req, res): Promise<void> => {
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
router.get("/badges/all", async (req, res): Promise<void> => {
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
router.get("/daily-tasks", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const today = new Date().toISOString().split("T")[0];
    await advanceDailyTasks(userId, "visit");

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
      if (task.progress === null) {
        await db
          .insert(userDailyTasksTable)
          .values({
            userId,
            taskId: task.id,
            progress: 0,
            completed: false,
            date: today,
          })
          .onConflictDoNothing();
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

async function advanceDailyTasks(
  userId: string,
  taskType: "post_confession" | "comment" | "like" | "visit",
) {
  const today = new Date().toISOString().split("T")[0];
  const tasks = await db
    .select({
      id: dailyTasksTable.id,
      targetCount: dailyTasksTable.targetCount,
      xpReward: dailyTasksTable.xpReward,
    })
    .from(dailyTasksTable)
    .where(
      and(
        eq(dailyTasksTable.isActive, true),
        eq(dailyTasksTable.taskType, taskType),
      ),
    );

  for (const task of tasks) {
    await db
      .insert(userDailyTasksTable)
      .values({
        userId,
        taskId: task.id,
        progress: 0,
        completed: false,
        date: today,
      })
      .onConflictDoNothing();

    const [userTask] = await db
      .select({
        id: userDailyTasksTable.id,
        progress: userDailyTasksTable.progress,
        completed: userDailyTasksTable.completed,
      })
      .from(userDailyTasksTable)
      .where(
        and(
          eq(userDailyTasksTable.userId, userId),
          eq(userDailyTasksTable.taskId, task.id),
          eq(userDailyTasksTable.date, today),
        ),
      )
      .limit(1);

    if (!userTask || userTask.completed) continue;

    const progress = Math.min(userTask.progress + 1, task.targetCount);
    const completed = progress >= task.targetCount;
    const [updatedTask] = await db
      .update(userDailyTasksTable)
      .set({
        progress,
        completed,
        completedAt: completed ? new Date() : null,
      })
      .where(
        and(
          eq(userDailyTasksTable.id, userTask.id),
          eq(userDailyTasksTable.completed, false),
        ),
      )
      .returning({ completed: userDailyTasksTable.completed });

    if (updatedTask?.completed) {
      await addXP(userId, task.xpReward);
    }
  }
}

// 輔助函數：更新用戶活動統計
export async function updateUserActivity(
  userId: string,
  type: "confession" | "comment" | "like_given" | "like_received",
) {
  await db.insert(userStatsTable).values({ userId }).onConflictDoNothing();
  const [stats] = await db
    .select()
    .from(userStatsTable)
    .where(eq(userStatsTable.userId, userId))
    .limit(1);

  if (!stats) throw new Error(`Unable to initialize stats for user ${userId}`);

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const lastActivityDate = stats.lastActivityDate
    ? new Date(stats.lastActivityDate).toISOString().split("T")[0]
    : null;
  const streakDays =
    lastActivityDate === today
      ? stats.streakDays
      : lastActivityDate === getYesterday()
        ? stats.streakDays + 1
        : 1;
  const counterUpdate =
    type === "confession"
      ? { totalConfessions: sql`${userStatsTable.totalConfessions} + 1` }
      : type === "comment"
        ? { totalComments: sql`${userStatsTable.totalComments} + 1` }
        : type === "like_given"
          ? { totalLikesGiven: sql`${userStatsTable.totalLikesGiven} + 1` }
          : {
              totalLikesReceived: sql`${userStatsTable.totalLikesReceived} + 1`,
            };

  await db
    .update(userStatsTable)
    .set({
      lastActiveAt: new Date(),
      lastActivityDate: new Date(`${today}T00:00:00.000Z`),
      streakDays,
      ...counterUpdate,
    })
    .where(eq(userStatsTable.userId, userId));

  const xpByActivity = {
    confession: 10,
    comment: 5,
    like_given: 2,
    like_received: 0,
  } satisfies Record<typeof type, number>;
  await addXP(userId, xpByActivity[type]);

  const taskType =
    type === "confession"
      ? "post_confession"
      : type === "comment"
        ? "comment"
        : type === "like_given"
          ? "like"
          : null;
  if (taskType) await advanceDailyTasks(userId, taskType);

  await checkAndAwardBadges(userId);
}

async function addXP(userId: string, xpAmount: number) {
  if (xpAmount <= 0) return;

  await db.insert(userStatsTable).values({ userId }).onConflictDoNothing();
  const [stats] = await db
    .update(userStatsTable)
    .set({ xp: sql`${userStatsTable.xp} + ${xpAmount}` })
    .where(eq(userStatsTable.userId, userId))
    .returning({ xp: userStatsTable.xp, level: userStatsTable.level });
  if (!stats) throw new Error(`Unable to update XP for user ${userId}`);

  const level = calculateLevel(stats.xp);
  if (level !== stats.level) {
    const [leveledUp] = await db
      .update(userStatsTable)
      .set({ level })
      .where(
        and(
          eq(userStatsTable.userId, userId),
          eq(userStatsTable.level, stats.level),
        ),
      )
      .returning({ level: userStatsTable.level });
    if (leveledUp) {
      await createNotification(
        userId,
        "level_up",
        "Level up!",
        `You reached level ${level}.`,
      );
    }
  }
}

function calculateLevel(xp: number): number {
  return Math.floor(xp / 100) + 1;
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
      const [awardedBadge] = await db
        .insert(userBadgesTable)
        .values({ userId, badgeId: badge.id })
        .onConflictDoNothing()
        .returning({ id: userBadgesTable.id });
      if (awardedBadge) {
        await createNotification(
          userId,
          "badge_earned",
          `Badge earned: ${badge.name}`,
          badge.description,
        );
      }
    }
  }
}

function getYesterday(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
}

export default router;
