import type { Request, Response, NextFunction } from "express";
import type { GenerateRequestInput } from "../validator/schemas.js";
import type { ApiSuccess, GenerateResponse } from "../types/index.js";
import { generateProjectPlan } from "../services/generateService.js";

// ============================================================
// POST /api/generate
// By the time this runs, req.body is already validated by
// the validate() middleware — so we can safely type it.
// ============================================================

export async function generateController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { projectIdea } = req.body as GenerateRequestInput;

    const result: GenerateResponse = await generateProjectPlan(projectIdea);

    const response: ApiSuccess<GenerateResponse> = {
      success: true,
      status: 200,
      data: result,
    };

    res.status(200).json(response);
  } catch (err) {
    // Pass to global error handler
    next(err);
  }
}