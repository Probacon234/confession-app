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

// Delete confession post by ID (Handles cascading comments, reports, and error messages)
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
    // 1. Delete associated reports first
    await db
      .delete(confessionReportsTable)
      .where(eq(confessionReportsTable.confessionId, postId));

    // 2. Delete target confession post
    await db
      .delete(confessionsTable)
      .where(eq(confessionsTable.id, postId));

    return res.json({ success: true, message: "Post deleted successfully" });
  } catch (error: any) {
    logger.error({ error }, "Failed to delete post");
    // Return explicit error details to assist debugging
    return res.status(500).json({ 
      message: error?.message || "Database execution failed while deleting post." 
    });
  }
};

// Register routes
router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

// Register routes for both endpoints
router.delete("/confessions/:id", handleDeleteConfession);
router.delete("/posts/:id", handleDeleteConfession);

// Ban user route
router.post("/users/ban", async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "Missing userId" });
  }

  try {
    await clerkClient.users.banUser(userId);
    return res.json({ success: true, message: "User banned successfully" });
  } catch (error) {
    logger.error({ error }, "Failed to ban user");
    return res.status(500).json({ message: "Failed to ban user" });
  }
});

// 2. Ban user via Clerk Server SDK
router.post("/users/ban", async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "Missing userId" });
  }

  try {
    // Ban user using Clerk SDK
    await clerkClient.users.banUser(userId);
    return res.json({ success: true, message: "User banned successfully" });
  } catch (error) {
    logger.error({ error }, "Failed to ban user");
    return res.status(500).json({ message: "Failed to ban user" });
  }
});

export default router;