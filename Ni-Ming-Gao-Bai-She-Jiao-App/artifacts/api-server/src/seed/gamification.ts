import {
  badgesTable,
  dailyTasksTable,
  db,
} from "@workspace/db";

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
    await db
      .insert(badgesTable)
      .values(badge)
      .onConflictDoNothing();
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
    await db
      .insert(dailyTasksTable)
      .values(task)
      .onConflictDoNothing();
  }

  console.log("Seeded daily tasks");
  console.log("Gamification data seeding complete!");
}
