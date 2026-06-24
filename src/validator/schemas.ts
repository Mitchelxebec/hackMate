import { z } from "zod";

// ============================================================
// INPUT SCHEMA — strict, we control this data
// ============================================================

export const GenerateRequestSchema = z.object({
  projectIdea: z
    .string({ error: "projectIdea is required" })
    .trim()
    .min(10, "Project idea must be at least 10 characters")
    .max(500, "Project idea must be under 500 characters"),
});

// ============================================================
// USER STORIES
// ============================================================

const UserStorySchema = z.object({
  id: z.string(),
  role: z.string(),
  goal: z.string(),
  benefit: z.string(),
  acceptanceCriteria: z.array(z.string()).min(1),
  // AI occasionally returns "must have" with a space — normalize it
  priority: z.enum(["must-have", "should-have", "nice-to-have"]).catch("should-have"),
});

// ============================================================
// MVP SCOPE
// ============================================================

const MVPFeatureSchema = z.object({
  feature: z.string(),
  reason: z.string(),
});

const MVPScopeSchema = z.object({
  included: z.array(MVPFeatureSchema).min(1),
  excluded: z.array(MVPFeatureSchema).min(1),
});

// ============================================================
// ARCHITECTURE
// ============================================================

const ArchComponentSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  communicatesWith: z.array(z.string()),
  techChoice: z.string(),
});

const ArchitectureSchema = z.object({
  overview: z.string(),
  pattern: z.string(),
  components: z.array(ArchComponentSchema).min(2),
  storageNote: z.string(),
});

// ============================================================
// DATABASE SCHEMA
// ============================================================

const DBFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().catch(true),
  primaryKey: z.boolean().catch(false),
  foreignKey: z.string().optional().catch(undefined),
  unique: z.boolean().optional().catch(undefined),
  defaultValue: z.string().optional().catch(undefined),
  notes: z.string().optional().catch(undefined),
});

const DBTableSchema = z.object({
  name: z.string(),
  description: z.string(),
  fields: z.array(DBFieldSchema).min(1),
  indexes: z.array(z.string()).optional(),
});

const DBSchemaSchema = z.object({
  tables: z.array(DBTableSchema).min(1),
  relationships: z.array(z.string()).min(1),
});

// ============================================================
// SPRINT BOARD
// AI output can't be fully constrained — use .catch() to
// fall back gracefully instead of throwing on unexpected values.
// ============================================================

const SprintTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  // AI returns "infrastructure", "testing" etc — accept any string
  type: z.string().catch("feature"),
  // AI may return 4 or 6 — snap to nearest valid Fibonacci point
  storyPoints: z.number().transform((n) => {
    const valid = [1, 2, 3, 5, 8] as const;
    return valid.reduce((prev, curr) =>
      Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev,
    );
  }),
  // AI may return "qa", "infra" etc — fall back to "fullstack"
  assignedTo: z.string().catch("fullstack"),
  dependsOn: z.array(z.string()).optional(),
});

const SprintEpicSchema = z.object({
  epic: z.string(),
  tasks: z.array(SprintTaskSchema).min(1),
});

const SprintSchema = z.object({
  sprintNumber: z.number(),
  goal: z.string(),
  epics: z.array(SprintEpicSchema).min(1),
});

const SprintBoardSchema = z.object({
  // z.array + slice instead of z.tuple — don't crash if AI returns 3 sprints
  sprints: z.array(SprintSchema).min(1).transform((s) => s.slice(0, 2) as [typeof s[0], typeof s[0]]),
});

// ============================================================
// FULL AI OUTPUT SCHEMA
// ============================================================

export const ClaudeOutputSchema = z.object({
  userStories: z.array(UserStorySchema).min(3),
  mvpScope: MVPScopeSchema,
  architecture: ArchitectureSchema,
  dbSchema: DBSchemaSchema,
  sprintBoard: SprintBoardSchema,
});

export type GenerateRequestInput = z.infer<typeof GenerateRequestSchema>;
export type ClaudeOutput = z.infer<typeof ClaudeOutputSchema>;