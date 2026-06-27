import type { GenerateResponse } from "../types/index.js";
import { ClaudeOutputSchema } from "../validator/schemas.js";
import { randomUUID } from "crypto";
import { uploadToZeroG } from "./storageService.js";

const SYSTEM_PROMPT = `You are an expert AI product manager, solutions architect, and engineering lead.

When given a project idea, you produce a complete product specification as a single raw JSON object.

RULES:
- Respond with ONLY the JSON object. No markdown. No code fences. No explanation before or after.
- All string values must be non-empty.
- userStories: generate at least 5 stories covering different user roles.
- mvpScope.included: at least 4 features. mvpScope.excluded: at least 3 features.
- architecture.components: at least 5 components. Always include a "0G Storage" component and explain its role in storageNote.
- dbSchema.tables: at least 3 tables with realistic fields, proper types, and foreign keys.
- sprintBoard: exactly 2 sprints. Each sprint must have at least 2 epics. Each epic must have at least 3 tasks.
- storyPoints must be one of: 1, 2, 3, 5, 8.
- assignedTo must be one of: "frontend", "backend", "fullstack", "design", "devops".
- task type must be one of: "feature", "chore", "bug", "design", "devops".
- priority must be one of: "must-have", "should-have", "nice-to-have".

JSON SHAPE (follow exactly):
{
  "userStories": [{ "id": "US-01", "role": "string", "goal": "string", "benefit": "string", "acceptanceCriteria": ["string"], "priority": "must-have" }],
  "mvpScope": { "included": [{ "feature": "string", "reason": "string" }], "excluded": [{ "feature": "string", "reason": "string" }] },
  "architecture": { "overview": "string", "pattern": "string", "components": [{ "name": "string", "type": "string", "description": "string", "communicatesWith": ["string"], "techChoice": "string" }], "storageNote": "string" },
  "dbSchema": { "tables": [{ "name": "string", "description": "string", "fields": [{ "name": "string", "type": "string", "nullable": false, "primaryKey": false }], "indexes": ["string"] }], "relationships": ["string"] },
  "sprintBoard": { "sprints": [{ "sprintNumber": 1, "goal": "string", "epics": [{ "epic": "string", "tasks": [{ "id": "string", "title": "string", "type": "feature", "storyPoints": 3, "assignedTo": "backend" }] }] }] }
}`;

export async function generateProjectPlan(
  projectIdea: string,
): Promise<GenerateResponse> {
  // STEP 1: Call Gemini
  const rawJson = await callAI(projectIdea);

  // STEP 2: Parse JSON
  let parsed: unknown;
  try {
    const cleaned = rawJson.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned invalid JSON — could not parse response");
  }

  // STEP 3: Validate against schema
  const validated = ClaudeOutputSchema.parse(parsed);

  // STEP 4: Assemble response
  const sessionId = randomUUID();
  const generatedAt = new Date().toISOString();

  const payload = { sessionId, projectIdea, generatedAt, ...validated };

  // STEP 5: Upload to 0G with a 15s timeout — non-blocking if it takes too long
  let storageHash: string | undefined;
  try {
    const uploadWithTimeout = Promise.race([
      uploadToZeroG(payload),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("0G upload timed out after 15s")), 15_000)
      ),
    ]);
    storageHash = await uploadWithTimeout;
    console.log(`[generateService] Stored on 0G — hash: ${storageHash}`);
  } catch (err: unknown) {
    console.error("[generateService] 0G upload failed (non-fatal):", err);
  }

  const response: GenerateResponse = {
    ...payload,
    ...(storageHash ? { storageHash } : {}),
  };

  return response;
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

interface GroqResponse {
  choices: { message: { content: string } }[];
}

// ============================================================
// PRIMARY: GEMINI
// Throws on ANY failure — HTTP error, quota, empty response,
// error object in body — so the router always catches it
// ============================================================

async function callGemini(projectIdea: string): Promise<string> {
  console.log(`[generateService] Calling Gemini...`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `Generate a complete product specification for this idea:\n\n"${projectIdea}"` }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    },
  );

  // Read body once — Gemini returns 200 with error object on quota exceeded
  const raw = await res.json() as Record<string, unknown>;

  if (!res.ok || raw["error"]) {
    const msg = (raw["error"] as Record<string, unknown>)?.["message"] ?? res.statusText;
    throw new Error(`Gemini error ${res.status}: ${String(msg)}`);
  }

  const candidates = raw["candidates"] as GeminiResponse["candidates"] | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = (candidates?.[0] as Record<string, unknown>)?.["finishReason"];

  if (!text || (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS")) {
    throw new Error(`Gemini returned no usable text (finishReason: ${String(finishReason)})`);
  }

  console.log(`[generateService] Gemini responded successfully`);
  return text;
}

// ============================================================
// FALLBACK: GROQ
// ============================================================

async function callGroq(projectIdea: string): Promise<string> {
  console.log(`[generateService] Calling Groq...`);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Generate a complete product specification for this idea:\n\n"${projectIdea}"` },
      ],
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Groq API error ${res.status}: ${error}`);
  }

  const data = (await res.json()) as GroqResponse;
  const text = data.choices[0]?.message.content;
  if (!text) throw new Error("Groq returned empty response");

  console.log(`[generateService] Groq responded successfully`);
  return text;
}

// ============================================================
// AI ROUTER — Gemini first, Groq fallback
// Any throw from callGemini (quota, error body, empty text)
// immediately routes to Groq — no silent failures
// ============================================================

async function callAI(projectIdea: string): Promise<string> {
  try {
    return await callGemini(projectIdea);
  } catch (err) {
    console.warn(`[generateService] Gemini failed — reason: ${String(err)}`);
    console.log(`[generateService] Switching to Groq...`);
    return await callGroq(projectIdea);
  }
}