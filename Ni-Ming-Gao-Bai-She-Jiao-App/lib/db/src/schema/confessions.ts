import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  boolean
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const confessionsTable = pgTable(
  "confessions",
  {
    id: serial("id").primaryKey(),
    igStatus: text("ig_status").default("pending"), // 狀態：'pending' | 'published' | 'failed'
    igError: text("ig_error"),                      // 記錄失敗原因
    content: text("content").notNull(),
    category: text("category").notNull(),
    authorId: text("author_id").notNull(),
    igMediaId: text("ig_media_id"),
    igPostedAt: timestamp("ig_posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("confessions_created_at_idx").on(table.createdAt)],
);

export const confessionLikesTable = pgTable(
  "confession_likes",
  {
    confessionId: integer("confession_id")
      .notNull()
      .references(() => confessionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.confessionId, table.userId] }),
    index("confession_likes_user_id_idx").on(table.userId),
  ],
);

export const confessionCommentsTable = pgTable(
  "confession_comments",
  {
    id: serial("id").primaryKey(),
    confessionId: integer("confession_id")
      .notNull()
      .references(() => confessionsTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("confession_comments_confession_id_idx").on(table.confessionId),
  ],
);

export const confessionReportsTable = pgTable(
  "confession_reports",
  {
    id: serial("id").primaryKey(),
    confessionId: integer("confession_id")
      .notNull()
      .references(() => confessionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("confession_reports_unique_user_idx").on(
      table.confessionId,
      table.userId,
    ),
    index("confession_reports_status_idx").on(table.status),
    index("confession_reports_created_at_idx").on(table.createdAt),
  ],
);

export const insertConfessionSchema = createInsertSchema(confessionsTable).omit({
  id: true,
  authorId: true,
  createdAt: true,
});
export const insertConfessionCommentSchema = createInsertSchema(
  confessionCommentsTable,
).omit({ id: true, authorId: true, createdAt: true });
export type InsertConfession = z.infer<typeof insertConfessionSchema>;
export type Confession = typeof confessionsTable.$inferSelect;
export type ConfessionComment = typeof confessionCommentsTable.$inferSelect;

// 自建的黑名單資料表
export const bannedUsersTable = pgTable("banned_users", {
  userId: text("user_id").primaryKey(), // 儲存使用者的 Clerk ID
  bannedAt: timestamp("banned_at").defaultNow().notNull(),
});

// ==========================================
// 公告功能 (Announcements)
// ==========================================
export const announcementsTable = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),              // 公告標題
    content: text("content").notNull(),          // 公告內容
    authorId: text("author_id").notNull(),       // 紀錄是哪個管理員發的
    isActive: boolean("is_active").notNull().default(true), // 是否顯示在首頁
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

// 給 Zod 驗證使用的 Insert Schema
export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({
  id: true,
  createdAt: true,
});


   // 一般設定 (App settings)：例如 Instagram token 自動刷新用
   export const appSettingsTable = pgTable("app_settings", {
     key: text("key").primaryKey(),
     value: text("value").notNull(),
     updatedAt: timestamp("updated_at", { withTimezone: true })
       .notNull()
       .defaultNow(),
   });

// ==========================================
// 遊戲化功能 - 用戶統計
// ==========================================
export const userStatsTable = pgTable(
  "user_stats",
  {
    userId: text("user_id").primaryKey(),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    totalConfessions: integer("total_confessions").notNull().default(0),
    totalComments: integer("total_comments").notNull().default(0),
    totalLikesReceived: integer("total_likes_received").notNull().default(0),
    totalLikesGiven: integer("total_likes_given").notNull().default(0),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    streakDays: integer("streak_days").notNull().default(0),
    lastActivityDate: timestamp("last_activity_date", { withTimezone: true }),
  },
  (table) => [index("user_stats_level_idx").on(table.level)],
);

// ==========================================
// 遊戲化功能 - 徽章系統
// ==========================================
export const badgesTable = pgTable(
  "badges",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull(),
    requirementType: text("requirement_type").notNull(), // 'confessions', 'comments', 'likes', 'streak', 'special'
    requirementValue: integer("requirement_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("badges_requirement_type_idx").on(table.requirementType)],
);

export const userBadgesTable = pgTable(
  "user_badges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    badgeId: integer("badge_id")
      .notNull()
      .references(() => badgesTable.id, { onDelete: "cascade" }),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_badges_unique_idx").on(table.userId, table.badgeId),
    index("user_badges_user_id_idx").on(table.userId),
  ],
);

// ==========================================
// 遊戲化功能 - 每日任務
// ==========================================
export const dailyTasksTable = pgTable(
  "daily_tasks",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    taskType: text("task_type").notNull(), // 'post_confession', 'comment', 'like', 'visit'
    targetCount: integer("target_count").notNull(),
    xpReward: integer("xp_reward").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("daily_tasks_active_idx").on(table.isActive)],
);

export const userDailyTasksTable = pgTable(
  "user_daily_tasks",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    taskId: integer("task_id")
      .notNull()
      .references(() => dailyTasksTable.id, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    date: text("date").notNull(), // YYYY-MM-DD format
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("user_daily_tasks_unique_idx").on(table.userId, table.taskId, table.date),
    index("user_daily_tasks_user_date_idx").on(table.userId, table.date),
  ],
);

// ==========================================
// 通知系統
// ==========================================
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(), // 'comment_reply', 'like', 'badge_earned', 'level_up'
    title: text("title").notNull(),
    message: text("message").notNull(),
    relatedId: integer("related_id"), // confessionId, commentId, etc.
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_read_idx").on(table.read),
    index("notifications_created_at_idx").on(table.createdAt),
  ],
);