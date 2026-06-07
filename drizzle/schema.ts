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

// ── Enums ────────────────────────────────────────────────────────────────────
export type Difficulty = "Easy" | "Medium" | "Hard";
export type GameMode = "classic" | "consecutive" | "parallel";

// ── Sentence bank ────────────────────────────────────────────────────────────
export const sentences = mysqlTable("sentences", {
  id: int("id").autoincrement().primaryKey(),
  /**
   * Full sentence text with one or more [MASK] placeholders.
   * - classic:     exactly one [MASK]
   * - consecutive: two or more [MASK] tokens revealed one at a time in order
   * - parallel:    two or more [MASK] tokens filled simultaneously
   */
  text: text("text").notNull(),
  /**
   * For classic mode: the single correct answer.
   * For multi-mask modes: the answer for the FIRST mask (kept for backward compat).
   */
  answer: varchar("answer", { length: 128 }).notNull(),
  /**
   * JSON array of correct answers for each [MASK] in order.
   * e.g. '["Newton","gravity"]'
   * For classic sentences this is a single-element array.
   */
  masks: text("masks").notNull().default("[]"),
  /** Which game mode this sentence belongs to */
  gameMode: mysqlEnum("gameMode", ["classic", "consecutive", "parallel"]).notNull().default("classic"),
  difficulty: mysqlEnum("difficulty", ["Easy", "Medium", "Hard"]).notNull(),
  /** Optional domain tag, e.g. "science", "history" */
  domain: varchar("domain", { length: 64 }).default("general"),
  /** BERT model category — matches the model selector keys in the UI */
  bertCategory: mysqlEnum("bertCategory", ["general", "medical", "clinical", "science", "finance", "legal", "cbow"]).notNull().default("general"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Sentence = typeof sentences.$inferSelect;

// ── Game sessions ────────────────────────────────────────────────────────────
export const gameSessions = mysqlTable("game_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** null = anonymous guest */
  userId: int("userId"),
  difficulty: mysqlEnum("difficulty", ["Easy", "Medium", "Hard"]).notNull(),
  /** Which game mode this session uses */
  gameMode: mysqlEnum("gameMode", ["classic", "consecutive", "parallel"]).notNull().default("classic"),
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
  /**
   * For classic/consecutive: the player's answer for a single mask.
   * For parallel: JSON array of answers in mask order, e.g. '["Newton","gravity"]'
   */
  playerAnswer: varchar("playerAnswer", { length: 512 }),
  /** For consecutive mode: which mask index (0-based) this answer is for */
  maskIndex: int("maskIndex").notNull().default(0),
  isCorrect: boolean("isCorrect").notNull().default(false),
  hintUsed: boolean("hintUsed").notNull().default(false),
  pointsEarned: int("pointsEarned").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SessionAnswer = typeof sessionAnswers.$inferSelect;
