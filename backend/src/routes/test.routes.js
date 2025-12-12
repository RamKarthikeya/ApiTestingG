// src/routes/test.routes.js
import { Router } from "express";
import { generate, run } from "../controllers/test.controller.js";
import { generationLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// AI Test Case Generation (NVIDIA)
router.post("/generate-tests", generationLimiter, generate);

// Run Tests
router.post("/run-tests", run);

export default router;
