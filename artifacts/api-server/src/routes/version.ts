import { Router } from "express";

const router = Router();
const startedAt = new Date().toISOString();

router.get("/version", (_req, res) => {
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    process.env.GITHUB_SHA ||
    "unknown";

  res.json({
    app: "TAMS",
    commit,
    buildTime: process.env.BUILD_TIME || startedAt,
    environment: process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || "unknown",
    frontendBuild: process.env.FRONTEND_BUILD || "vite-production",
  });
});

export default router;
