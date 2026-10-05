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
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const confessionsTable = pgTable(
  "confessions",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    category: text("category").notNull(),
    authorId: text("author_id").notNull(),
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