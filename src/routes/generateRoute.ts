import { Router } from "express";
import { validate } from "../middleware/validateBody.js";
import { GenerateRequestSchema } from "../validator/schemas.js";
import { generateController } from "../controllers/generateController.js";
import { planController } from "../controllers/planController.js";

const router = Router();

// POST /api/v1/generate
router.post("/generate", validate(GenerateRequestSchema), generateController);

// GET /api/v1/plan/:hash  — fetch a stored plan from 0G by root hash
router.get("/plan/:hash", planController);

export default router;