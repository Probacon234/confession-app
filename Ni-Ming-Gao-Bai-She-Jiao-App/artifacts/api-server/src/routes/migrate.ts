import { db } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { checkModerator } from "./moderation";
import { getAuth } from "@clerk/express";
import { seedGamificationData } from "../seed/gamification";

const router: IRouter = Router();

// 創建 gamification 表的端點（只需要運行一次）
router.post("/migrate/gamification", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuth(req).userId;

    // 檢查是否為管理員
    const check = await checkModerator(userId || "");
    if (check !== "allowed") {
      res.status(403).json({ error: "Only admins can run migrations" });
      return;
    }

    console.log("⏳ Running gamification migration...");

    // 這裡我們使用 drizzle-kit push
    // 但在運行時我們不能直接調用，所以需要通過其他方式
    // 作為替代，我們會告訴用戶如何手動運行

    res.json({
      message: "Please run migration via Render Build Script or use the seed endpoint",
      instructions: "Use POST /api/migrate/seed to seed gamification data after tables are created",
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    res.status(500).json({ error: "Migration failed" });
  }
});

// 種子數據端點（可以通過 HTTP 請求運行）
router.post("/migrate/seed", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuth(req).userId;

    // 檢查是否為管理員
    const check = await checkModerator(userId || "");
    if (check !== "allowed") {
      res.status(403).json({ error: "Only admins can seed data" });
      return;
    }

    console.log("⏳ Seeding gamification data...");
    await seedGamificationData();
    console.log("✅ Gamification data seeded successfully!");

    res.json({
      success: true,
      message: "Gamification data seeded successfully!",
    });
  } catch (error: any) {
    console.error("Seed error:", error);
    res.status(500).json({ error: "Seeding failed" });
  }
});

export default router;
