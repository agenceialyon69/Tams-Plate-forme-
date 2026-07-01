import { Router, type IRouter } from "express";
import { aiRateLimit, defaultRateLimit } from "../middlewares/rate-limit";
import healthRouter from "./health";
import authRouter from "./auth";
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
import studioVideoRouter from "./studio-video";
import studioMusicRouter from "./studio-music";
import systemRouter from "./system";
import observabilityRouter from "./observability";
import agentsRouter from "./agents";
import integrationsRouter from "./integrations";
import selfDevRouter from "./self-dev";
import workflowsRouter from "./workflows";
import exportRouter from "./export";
import missionsRouter from "./missions";
import kernelRouter from "./kernel";
import devRuntimeRouter from "./dev-runtime";
import capabilityRegistryRouter from "./capability-registry";

const router: IRouter = Router();

// Auth routes - public (no auth required)
router.use(authRouter);

// Health routes - public
router.use(healthRouter);

router.use(briefingRouter);
router.use("/conversations", aiRateLimit);
router.use(conversationsRouter);
router.use("/agents", aiRateLimit);
router.use(agentsRouter);
router.use(selfDevRouter);
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
router.use(studioVideoRouter);
router.use(studioMusicRouter);
router.use(systemRouter);
router.use(observabilityRouter);
router.use(integrationsRouter);
router.use(workflowsRouter);
router.use(exportRouter);
router.use(missionsRouter);
router.use(kernelRouter);
router.use(devRuntimeRouter);
router.use(capabilityRegistryRouter);
router.use(defaultRateLimit);

export default router;
