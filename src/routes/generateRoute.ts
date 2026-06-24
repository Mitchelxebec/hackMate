import { Router } from "express";
import { validate } from "../middleware/validateBody.js";
import { GenerateRequestSchema } from "../validator/schemas.js";
import { generateController } from "../controllers/generateController.js";

const router = Router();

// POST /api/generate
// 1. validate()  → runs GenerateRequestSchema on req.body, 400 if invalid
// 2. generateController → calls Claude, returns structured response
router.post("/generate", validate(GenerateRequestSchema), generateController);

export default router;