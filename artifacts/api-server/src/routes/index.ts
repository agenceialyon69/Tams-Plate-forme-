import { Router, type IRouter } from "express";
import { aiRateLimit, defaultRateLimit } from "../middlewares/rate-limit";
import healthRouter from "./health";
import briefingRouter from "./briefing";
import conversationsRouter from "./conversations";
import agentsRouter from "./agents";
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
import workflowsRouter from "./workflows";
import exportRouter from "./export";

const router: IRouter = Router();

// Apply default rate limit BEFORE all routes so it actually executes
router.use(defaultRateLimit);

router.use(healthRouter);
router.use(briefingRouter);
router.use("/conversations", aiRateLimit, conversationsRouter);
router.use("/agents", aiRateLimit, agentsRouter);
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
router.use(workflowsRouter);
router.use(exportRouter);

export default router;
