import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Difficulty enum ──────────────────────────────────────────────────────────
export type Difficulty = "Easy" | "Medium" | "Hard";

// ── Sentence bank ────────────────────────────────────────────────────────────
export const sentences = mysqlTable("sentences", {
  id: int("id").autoincrement().primaryKey(),
  /** Full sentence text with [MASK] placeholder */
  text: text("text").notNull(),
  /** Canonical correct answer (used as ground-truth fallback) */
  answer: varchar("answer", { length: 128 }).notNull(),
  difficulty: mysqlEnum("difficulty", ["Easy", "Medium", "Hard"]).notNull(),
  /** Optional domain tag, e.g. "science", "history" */
  domain: varchar("domain", { length: 64 }).default("general"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Sentence = typeof sentences.$inferSelect;

// ── Game sessions ────────────────────────────────────────────────────────────
export const gameSessions = mysqlTable("game_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** null = anonymous guest */
  userId: int("userId"),
  difficulty: mysqlEnum("difficulty", ["Easy", "Medium", "Hard"]).notNull(),
  totalQuestions: int("totalQuestions").notNull().default(0),
  correctAnswers: int("correctAnswers").notNull().default(0),
  totalScore: int("totalScore").notNull().default(0),
  maxScore: int("maxScore").notNull().default(0),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GameSession = typeof gameSessions.$inferSelect;

// ── Per-round answers ────────────────────────────────────────────────────────
export const sessionAnswers = mysqlTable("session_answers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  sentenceId: int("sentenceId").notNull(),
  playerAnswer: varchar("playerAnswer", { length: 256 }),
  isCorrect: boolean("isCorrect").notNull().default(false),
  hintUsed: boolean("hintUsed").notNull().default(false),
  pointsEarned: int("pointsEarned").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SessionAnswer = typeof sessionAnswers.$inferSelect;
