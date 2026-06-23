import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import capturesRouter from "./captures";
import tasksRouter from "./tasks";
import eventsRouter from "./events";
import learningsRouter from "./learnings";
import decisionsRouter from "./decisions";
import memoryRouter from "./memory";
import briefingsRouter from "./briefings";
import overloadRouter from "./overload";
import aiRouter from "./ai";
import recordingsRouter from "./recordings";
import leadsRouter from "./leads";
import auditRouter from "./audit";
import diagnosticsRouter from "./diagnostics";
import exportRouter from "./export";
import redTeamRouter from "./red-team";
import profileRouter from "./profile";
import quotasRouter from "./quotas";
import copilotRouter from "./copilot";
import integrationsRouter from "./integrations";
import nexusAiRouter from "./nexus-ai";
import appEventsRouter from "./app-events";
import { rateLimit, rateLimitByTenant, rateLimitByUser } from "../middlewares/rate-limit";
import { auditMiddleware } from "../middlewares/audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(auditMiddleware);

const aiLimiter = rateLimit({ windowMs: 60_000, max: 20 });
const tenantLimiter = rateLimitByTenant({ windowMs: 60_000, max: 300 });
const userLimiter = rateLimitByUser({ windowMs: 60_000, max: 100 });

router.use(tenantLimiter);
router.use(userLimiter);

router.use(usersRouter);
router.use(capturesRouter);
router.use(tasksRouter);
router.use(eventsRouter);
router.use(learningsRouter);
router.use(decisionsRouter);
router.use(memoryRouter);
router.use(briefingsRouter);
router.use(overloadRouter);
router.use(leadsRouter);
router.use(auditRouter);
router.use(diagnosticsRouter);
router.use(exportRouter);
router.use(redTeamRouter);
router.use(profileRouter);
router.use(quotasRouter);
router.use(integrationsRouter);
router.use(nexusAiRouter);
router.use(appEventsRouter);

// AI endpoints last, behind a single burst limiter. Because earlier routers
// have already handled (and ended) their requests, this limiter only runs for
// requests that fall through to the AI routes — it does NOT bleed onto other
// routes, and it is applied exactly once per request (not per mount).
router.use(aiLimiter);
router.use(aiRouter);
router.use(copilotRouter);
router.use(recordingsRouter);

export default router;
