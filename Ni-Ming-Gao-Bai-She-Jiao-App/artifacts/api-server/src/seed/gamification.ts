import {
  badgesTable,
  dailyTasksTable,
  db,
  userBadgesTable,
  userDailyTasksTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";

type BadgeSeed = {
  name: string;
  description: string;
  icon: string;
  requirementType: string;
  requirementValue: number;
};

type DailyTaskSeed = {
  name: string;
  description: string;
  taskType: string;
  targetCount: number;
  xpReward: number;
  isActive: boolean;
};

async function seedBadge(badge: BadgeSeed): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: badgesTable.id })
      .from(badgesTable)
      .where(
        and(
          eq(badgesTable.requirementType, badge.requirementType),
          eq(badgesTable.requirementValue, badge.requirementValue),
        ),
      )
      .orderBy(asc(badgesTable.id));
    const [canonical, ...duplicates] = existing;

    if (!canonical) {
      await tx.insert(badgesTable).values(badge);
      return;
    }

    await tx
      .update(badgesTable)
      .set(badge)
      .where(eq(badgesTable.id, canonical.id));

    for (const duplicate of duplicates) {
      const earnedBadges = await tx
        .select()
        .from(userBadgesTable)
        .where(eq(userBadgesTable.badgeId, duplicate.id));

      for (const earnedBadge of earnedBadges) {
        const [existingAward] = await tx
          .select({ id: userBadgesTable.id })
          .from(userBadgesTable)
          .where(
            and(
              eq(userBadgesTable.userId, earnedBadge.userId),
              eq(userBadgesTable.badgeId, canonical.id),
            ),
          )
          .limit(1);

        if (existingAward) {
          await tx
            .delete(userBadgesTable)
            .where(eq(userBadgesTable.id, earnedBadge.id));
        } else {
          await tx
            .update(userBadgesTable)
            .set({ badgeId: canonical.id })
            .where(eq(userBadgesTable.id, earnedBadge.id));
        }
      }

      await tx.delete(badgesTable).where(eq(badgesTable.id, duplicate.id));
    }
  });
}

async function seedDailyTask(task: DailyTaskSeed): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: dailyTasksTable.id })
      .from(dailyTasksTable)
      .where(eq(dailyTasksTable.taskType, task.taskType))
      .orderBy(asc(dailyTasksTable.id));
    const [canonical, ...duplicates] = existing;

    if (!canonical) {
      await tx.insert(dailyTasksTable).values(task);
      return;
    }

    await tx
      .update(dailyTasksTable)
      .set(task)
      .where(eq(dailyTasksTable.id, canonical.id));

    for (const duplicate of duplicates) {
      const duplicateProgress = await tx
        .select()
        .from(userDailyTasksTable)
        .where(eq(userDailyTasksTable.taskId, duplicate.id));

      for (const progress of duplicateProgress) {
        const [canonicalProgress] = await tx
          .select()
          .from(userDailyTasksTable)
          .where(
            and(
              eq(userDailyTasksTable.userId, progress.userId),
              eq(userDailyTasksTable.taskId, canonical.id),
              eq(userDailyTasksTable.date, progress.date),
            ),
          )
          .limit(1);

        if (canonicalProgress) {
          const mergedProgress = Math.min(
            task.targetCount,
            Math.max(canonicalProgress.progress, progress.progress),
          );
          const completed = canonicalProgress.completed || progress.completed;
          const completedAt =
            canonicalProgress.completedAt ?? progress.completedAt;

          await tx
            .update(userDailyTasksTable)
            .set({ progress: mergedProgress, completed, completedAt })
            .where(eq(userDailyTasksTable.id, canonicalProgress.id));
          await tx
            .delete(userDailyTasksTable)
            .where(eq(userDailyTasksTable.id, progress.id));
        } else {
          await tx
            .update(userDailyTasksTable)
            .set({ taskId: canonical.id })
            .where(eq(userDailyTasksTable.id, progress.id));
        }
      }

      await tx
        .delete(dailyTasksTable)
        .where(eq(dailyTasksTable.id, duplicate.id));
    }
  });
}

export async function seedGamificationData() {
  console.log("Seeding gamification data...");

  // 種子徽章數據
  const badges = [
    {
      name: "First Steps",
      description: "Posted your first confession",
      icon: "🌱",
      requirementType: "confessions",
      requirementValue: 1,
    },
    {
      name: "Storyteller",
      description: "Posted 10 confessions",
      icon: "📖",
      requirementType: "confessions",
      requirementValue: 10,
    },
    {
      name: "Voice of Many",
      description: "Posted 50 confessions",
      icon: "🎤",
      requirementType: "confessions",
      requirementValue: 50,
    },
    {
      name: "Good Listener",
      description: "Left 10 comments",
      icon: "👂",
      requirementType: "comments",
      requirementValue: 10,
    },
    {
      name: "Supportive Soul",
      description: "Left 50 comments",
      icon: "💝",
      requirementType: "comments",
      requirementValue: 50,
    },
    {
      name: "Appreciated",
      description: "Received 10 likes on your confessions",
      icon: "⭐",
      requirementType: "likes",
      requirementValue: 10,
    },
    {
      name: "Beloved",
      description: "Received 50 likes on your confessions",
      icon: "🌟",
      requirementType: "likes",
      requirementValue: 50,
    },
    {
      name: "Dedicated",
      description: "7-day activity streak",
      icon: "🔥",
      requirementType: "streak",
      requirementValue: 7,
    },
    {
      name: "Committed",
      description: "30-day activity streak",
      icon: "💪",
      requirementType: "streak",
      requirementValue: 30,
    },
  ];

  for (const badge of badges) {
    await seedBadge(badge);
  }

  console.log("Seeded badges");

  // 種子每日任務數據
  const dailyTasks = [
    {
      name: "Share Your Story",
      description: "Post 1 confession today",
      taskType: "post_confession",
      targetCount: 1,
      xpReward: 50,
      isActive: true,
    },
    {
      name: "Be Supportive",
      description: "Leave 3 comments today",
      taskType: "comment",
      targetCount: 3,
      xpReward: 30,
      isActive: true,
    },
    {
      name: "Show Appreciation",
      description: "Like 5 confessions today",
      taskType: "like",
      targetCount: 5,
      xpReward: 20,
      isActive: true,
    },
    {
      name: "Daily Visit",
      description: "Visit the wall today",
      taskType: "visit",
      targetCount: 1,
      xpReward: 10,
      isActive: true,
    },
  ];

  for (const task of dailyTasks) {
    await seedDailyTask(task);
  }

  console.log("Seeded daily tasks");
  console.log("Gamification data seeding complete!");
}
