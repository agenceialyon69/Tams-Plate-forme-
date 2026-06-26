import { Router, type IRouter } from "express";
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
import studioGenerateRouter from "./studio-generate";
import systemRouter from "./system";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingRouter);
router.use(conversationsRouter);
router.use(tasksRouter);
router.use(projectsRouter);
router.use(contactsRouter);
router.use(memoriesRouter);
router.use(decisionsRouter);
router.use(assetsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(studioGenerateRouter);
router.use(systemRouter);

export default router;
