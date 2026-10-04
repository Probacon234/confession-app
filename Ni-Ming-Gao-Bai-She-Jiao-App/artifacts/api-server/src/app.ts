import moderationRouter from "./routes/moderation";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use("/api/moderation", moderationRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// 1. 託管前端打包後的靜態檔案 (confession-community/dist/public)
const clientDistPath = path.resolve(__dirname, "../../confession-community/dist/public");
const indexPath = path.join(clientDistPath, "index.html");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("{*splat}", (req, res, next) => {
    // 如果是 API 請求，跳過靜態檔案處理
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {      res.status(404).send("Frontend build index.html not found.");
    }
  });
}

app.use(
  (error: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(error);
      return;
    }

    logger.error(
      { err: error, method: req.method, url: req.originalUrl.split("?")[0] },
      "Unhandled request error",
    );
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
