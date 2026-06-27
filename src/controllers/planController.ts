import type { Request, Response, NextFunction } from "express";
import type { ApiSuccess, GenerateResponse } from "../types/index.js";
import { downloadFromZeroG } from "../services/storageService.js";
import { ApiError } from "../utils/ApiError.js";

// ============================================================
// GET /api/v1/plan/:hash
// Fetches a previously stored GenerateResponse from 0G Storage
// by its root hash and returns it to the client.
// ============================================================

export async function planController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { hash } = req.params;

    if (!hash || typeof hash !== "string" || hash.trim().length === 0) {
      throw new ApiError(400, "A valid storage hash is required");
    }

    const data = await downloadFromZeroG(hash.trim());

    // Basic shape check — ensure it looks like a GenerateResponse
    if (
      typeof data !== "object" ||
      data === null ||
      !("sessionId" in data) ||
      !("projectIdea" in data)
    ) {
      throw new ApiError(422, "Stored data does not match expected plan format");
    }

    // Attach the hash back so the frontend can display it
    const plan = { ...(data as GenerateResponse), storageHash: hash.trim() };

    const response: ApiSuccess<GenerateResponse> = {
      success: true,
      status: 200,
      data: plan,
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
