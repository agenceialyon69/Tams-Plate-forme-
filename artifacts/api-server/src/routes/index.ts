import { Router, type IRouter } from "express";
import healthRouter from "./health";
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
import { rateLimit } from "../middlewares/rate-limit";
import { auditMiddleware } from "../middlewares/audit";

const router: IRouter = Router();

// Public, unauthenticated health check (used by platform probes).
router.use(healthRouter);

// Audit all write operations.
router.use(auditMiddleware);

// Tighter limit for expensive LLM-backed endpoints (Gemini / Groq).
const aiLimiter = rateLimit({ windowMs: 60_000, max: 20 });

router.use(capturesRouter);
router.use(tasksRouter);
router.use(eventsRouter);
router.use(learningsRouter);
router.use(decisionsRouter);
router.use(memoryRouter);
router.use(briefingsRouter);
router.use(overloadRouter);
router.use(aiLimiter, aiRouter);
router.use(aiLimiter, recordingsRouter);
router.use(leadsRouter);
router.use(auditRouter);
router.use(diagnosticsRouter);
router.use(exportRouter);
router.use(redTeamRouter);

export default router;
