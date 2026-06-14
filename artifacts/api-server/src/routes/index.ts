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

const router: IRouter = Router();

router.use(healthRouter);
router.use(capturesRouter);
router.use(tasksRouter);
router.use(eventsRouter);
router.use(learningsRouter);
router.use(decisionsRouter);
router.use(memoryRouter);
router.use(briefingsRouter);
router.use(overloadRouter);
router.use(aiRouter);

export default router;
