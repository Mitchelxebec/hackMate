import type { NextFunction, Request, Response } from "express";
import type { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";

// ============================================================
// VALIDATE MIDDLEWARE FACTORY
// Usage: router.post("/generate", validate(GenerateRequestSchema), controller)
//
// Runs req.body through the given Zod schema.
// On failure → throws ApiError(400) so your errorHandler catches it.
// On success → replaces req.body with the parsed, trimmed data.
// ============================================================

export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Format Zod's error tree into a flat, readable object
      // e.g. { "projectIdea": "Must be at least 10 characters" }
      const details = formatZodErrors(result.error);

      // Throw into your errorHandler — first field's message is the headline
      const firstMessage = Object.values(details)[0] ?? "Validation failed";
      throw new ApiError(400, firstMessage);
    }

    // Always write back parsed data — Zod may have trimmed strings,
    // coerced values, or stripped unknown keys depending on your schema
    req.body = result.data;
    next();
  };
};

// ============================================================
// ZOD ERROR FORMATTER
// Flattens Zod's nested issue array into { field: message }.
// issue.path = ["projectIdea"] → key = "projectIdea"
// issue.path = ["sprints", 0, "goal"] → key = "sprints.0.goal"
// ============================================================

function formatZodErrors(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "root";
    // Don't overwrite — first error per field wins
    if (!formatted[key]) {
      formatted[key] = issue.message;
    }
  }

  return formatted;
}