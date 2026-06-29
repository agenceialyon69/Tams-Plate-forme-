import { Router, type IRouter } from "express";
import { aiRateLimit, defaultRateLimit } from "../middlewares/rate-limit";
import healthRouter from "./health";
import briefingRouter from "./briefing";
import conversationsRouter from "./conversations";
import tasksRouter from "./tasks";
import projectsRouter from "./projects";
import contactsRouter from "./contacts";
import memoriesRouter from "./memories";
import decisionsRouter from "./decisions";
import assetsRouter from "./assets";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";
import studioRouter from "./studio";
import studioGenerateRouter from "./studio-generate";
import systemRouter from "./system";
import observabilityRouter from "./observability";
import agentsRouter from "./agents";
import integrationsRouter from "./integrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingRouter);
// INVARIANT (/AGENTS.md #8) : conversationsRouter et agentsRouter définissent
// déjà leurs chemins complets (/conversations, /agents). Les monter SANS préfixe.
// Avec un préfixe → double-préfixe → GET /api/conversations renvoie le HTML SPA
// → "X.find is not a function" → page noire du Chat. NE PAS RÉVERTER.
router.use("/conversations", aiRateLimit);
router.use(conversationsRouter);
router.use("/agents", aiRateLimit);
router.use(agentsRouter);
router.use(tasksRouter);
router.use(projectsRouter);
router.use(contactsRouter);
router.use(memoriesRouter);
router.use(decisionsRouter);
router.use(assetsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(studioRouter);
router.use(studioGenerateRouter);
router.use(systemRouter);
router.use(observabilityRouter);
router.use(integrationsRouter);
router.use(defaultRateLimit);

export default router;
