import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { confessionsTable, db } from "@workspace/db";
import { renderConfession } from "../lib/confessionImage";

const router: IRouter = Router();

router.get("/:file", async (req, res): Promise<void> => {
  const id = parseInt(req.params.file, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.sendStatus(404);
    return;
  }
  const [post] = await db
    .select({ id: confessionsTable.id, content: confessionsTable.content })
    .from(confessionsTable)
    .where(eq(confessionsTable.id, id))
    .limit(1);
  if (!post) {
    res.sendStatus(404);
    return;
  }
  res
    .type("image/jpeg")
    .set("Cache-Control", "public, max-age=3600")
    .send(renderConfession(post.content, post.id));
});

export default router;