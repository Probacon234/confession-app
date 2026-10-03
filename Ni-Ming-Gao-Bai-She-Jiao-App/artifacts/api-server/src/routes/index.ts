import { Router, type IRouter } from "express";
import healthRouter from "./health";
import confessionsRouter from "./confessions";
import moderationRouter from "./moderation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(confessionsRouter);
router.use(moderationRouter);

export default router;
