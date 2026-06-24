import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import generateRoute from "./routes/generateRoute.js";
import { errorHandler } from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();

app.use(express.json());

// CORS — allow all vercel deployments and localhost
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      const allowed =
        origin.endsWith(".vercel.app") ||
        origin === "http://localhost:5173" ||
        origin === "http://localhost:3000" ||
        (process.env.FRONTEND_URL
          ? process.env.FRONTEND_URL.split(",")
              .map((o) => o.trim())
              .includes(origin)
          : false);
      callback(null, allowed);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use("/api/v1", generateRoute);

app.get("/", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    message: "Hackathon Teammate API Gateway is now live",
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`🚀 Hackathon Teammate API running on port ${PORT}`);
});

export default app;
