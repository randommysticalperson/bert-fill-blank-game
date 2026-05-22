import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  gameSessions,
  InsertUser,
  sentences,
  sessionAnswers,
  users,
  type Difficulty,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── Sentences ────────────────────────────────────────────────────────────────

export async function getSentencesByDifficulty(
  difficulty: Difficulty,
  limit = 10,
  bertCategory?: string
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(sentences.difficulty, difficulty)];
  if (bertCategory && bertCategory !== "general") {
    // Filter to the chosen BERT model's category; fall back to general if none found
    const categoryRows = await db
      .select()
      .from(sentences)
      .where(and(eq(sentences.difficulty, difficulty), eq(sentences.bertCategory, bertCategory as any)))
      .orderBy(sql`RAND()`)
      .limit(limit);
    if (categoryRows.length > 0) return categoryRows;
    // Fallback: return general sentences if the requested category has none
  }

  return db
    .select()
    .from(sentences)
    .where(and(...conditions))
    .orderBy(sql`RAND()`)
    .limit(limit);
}

export async function getSentenceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sentences).where(eq(sentences.id, id)).limit(1);
  return result[0];
}

// ── Game sessions ────────────────────────────────────────────────────────────

export async function createGameSession(difficulty: Difficulty, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(gameSessions).values({
    difficulty,
    userId: userId ?? null,
    totalQuestions: 0,
    correctAnswers: 0,
    totalScore: 0,
    maxScore: 0,
  });
  return (result as any).insertId as number;
}

export async function getGameSession(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gameSessions).where(eq(gameSessions.id, id)).limit(1);
  return result[0];
}

export async function updateGameSession(
  id: number,
  patch: Partial<{
    totalQuestions: number;
    correctAnswers: number;
    totalScore: number;
    maxScore: number;
    completedAt: Date;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(gameSessions).set(patch).where(eq(gameSessions.id, id));
}

// ── Session answers ──────────────────────────────────────────────────────────

export async function saveSessionAnswer(data: {
  sessionId: number;
  sentenceId: number;
  playerAnswer: string;
  isCorrect: boolean;
  hintUsed: boolean;
  pointsEarned: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(sessionAnswers).values(data);
}

export async function getAnsweredSentenceIds(sessionId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ sentenceId: sessionAnswers.sentenceId })
    .from(sessionAnswers)
    .where(eq(sessionAnswers.sessionId, sessionId));
  return rows.map((r) => r.sentenceId);
}
