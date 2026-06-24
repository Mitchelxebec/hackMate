import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError.js";

const isDev = process.env.NODE_ENV === "development";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.statusCode,
      message: err.message,
      ...(isDev && { stack: err.stack }),
    });
  }

  // Log the real error server-side for debugging — never send it to the client
  console.error("💥 Unhandled Error:", err);

  // Return a generic 500 so internal details (Drizzle traces, DB errors, etc.) never reach the client
  return res.status(500).json({
    success: false,
    status: 500,
    message: "An unexpected error occurred. Please try again later.",
    ...(isDev && { stack: err.stack }),
  });
};