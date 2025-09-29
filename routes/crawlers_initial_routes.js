import express from "express";
import { addTask, removeTask } from "../controllers/taskController.js";

const router = express.Router();

router.post("/start", addTask);
router.post("/stop", removeTask);

export default router;
