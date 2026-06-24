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

  const response: GenerateResponse = {
    sessionId,
    projectIdea,
    generatedAt,
    ...validated,
  };

  // STEP 5: Upload to 0G Storage in background — don't block the response
  // If upload fails we log it but still return the generated plan
  uploadToZeroG({ sessionId, projectIdea, generatedAt, ...validated })
    .then((rootHash) => {
      console.log(`[generateService] Stored on 0G — hash: ${rootHash}`);
      // In a real app you'd persist this hash to a DB here
    })
    .catch((err: unknown) => {
      console.error("[generateService] 0G upload failed (non-fatal):", err);
    });

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
// ============================================================

async function callGemini(projectIdea: string, attempt = 1): Promise<string> {
  console.log(`[generateService] Calling Gemini (attempt ${attempt})...`);

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

  if (!res.ok) {
    const error = await res.text();
    if (res.status === 503 && attempt < 3) {
      console.log(`[generateService] Gemini 503 — retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
      return callGemini(projectIdea, attempt + 1);
    }
    throw new Error(`Gemini API error ${res.status}: ${error}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates[0]?.content.parts[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  console.log(`[generateService] Gemini responded successfully`);
  return text;
}

// ============================================================
// FALLBACK: GROQ
// ============================================================

async function callGroq(projectIdea: string): Promise<string> {
  console.log(`[generateService] Falling back to Groq...`);

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
// ============================================================

async function callAI(projectIdea: string): Promise<string> {
  try {
    return await callGemini(projectIdea);
  } catch (err) {
    console.warn(`[generateService] Gemini failed: ${String(err)}`);
    console.log(`[generateService] Switching to Groq fallback...`);
    return await callGroq(projectIdea);
  }
}