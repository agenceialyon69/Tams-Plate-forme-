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
import systemRouter from "./system";
import observabilityRouter from "./observability";
import agentsRouter from "./agents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingRouter);
// conversations/agents définissent leurs chemins complets (/conversations,
// /agents) : rate-limit par préfixe puis montage SANS préfixe (sinon
// double-préfixe → 404).
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
router.use(systemRouter);
router.use(observabilityRouter);
router.use(defaultRateLimit);

export default router;
