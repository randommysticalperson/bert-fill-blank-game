/**
 * seed-cbow.mjs — Seed CBOW (Word2Vec) category sentences.
 *
 * CBOW sentences are designed to test context-bag prediction:
 * the surrounding words strongly constrain the answer, making
 * them ideal for demonstrating the Word2Vec context-averaging approach.
 *
 * Run: node scripts/seed-cbow.mjs
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// 30 sentences: 10 Easy, 10 Medium, 10 Hard
// Each has a single [MASK] whose answer is strongly predicted by context words.
const SENTENCES = [
  // ── Easy (10) ──────────────────────────────────────────────────────────────
  {
    text: "The [MASK] barked loudly at the passing car.",
    answer: "dog",
    difficulty: "Easy",
    domain: "everyday",
  },
  {
    text: "She opened the [MASK] and walked into the room.",
    answer: "door",
    difficulty: "Easy",
    domain: "everyday",
  },
  {
    text: "The chef added salt and [MASK] to season the dish.",
    answer: "pepper",
    difficulty: "Easy",
    domain: "cooking",
  },
  {
    text: "He turned on the [MASK] to light up the dark room.",
    answer: "lamp",
    difficulty: "Easy",
    domain: "everyday",
  },
  {
    text: "The students opened their [MASK] and began to read.",
    answer: "books",
    difficulty: "Easy",
    domain: "education",
  },
  {
    text: "She planted seeds in the [MASK] and watered them daily.",
    answer: "garden",
    difficulty: "Easy",
    domain: "nature",
  },
  {
    text: "The pilot guided the [MASK] safely through the storm.",
    answer: "plane",
    difficulty: "Easy",
    domain: "travel",
  },
  {
    text: "He put on his coat and [MASK] before going outside in the cold.",
    answer: "gloves",
    difficulty: "Easy",
    domain: "everyday",
  },
  {
    text: "The baker took the fresh [MASK] out of the oven.",
    answer: "bread",
    difficulty: "Easy",
    domain: "cooking",
  },
  {
    text: "She typed the message on her [MASK] and pressed send.",
    answer: "keyboard",
    difficulty: "Easy",
    domain: "technology",
  },

  // ── Medium (10) ────────────────────────────────────────────────────────────
  {
    text: "The scientist observed the [MASK] through a powerful microscope.",
    answer: "cells",
    difficulty: "Medium",
    domain: "science",
  },
  {
    text: "The treaty was signed to end the [MASK] between the two nations.",
    answer: "conflict",
    difficulty: "Medium",
    domain: "history",
  },
  {
    text: "The stock market experienced a sharp [MASK] after the announcement.",
    answer: "decline",
    difficulty: "Medium",
    domain: "finance",
  },
  {
    text: "The architect designed a [MASK] that blended modern and classical styles.",
    answer: "building",
    difficulty: "Medium",
    domain: "architecture",
  },
  {
    text: "The jury reached a unanimous [MASK] after three days of deliberation.",
    answer: "verdict",
    difficulty: "Medium",
    domain: "law",
  },
  {
    text: "The athlete trained for months to improve her [MASK] in the marathon.",
    answer: "endurance",
    difficulty: "Medium",
    domain: "sports",
  },
  {
    text: "The novel explored themes of identity and [MASK] in a post-war society.",
    answer: "belonging",
    difficulty: "Medium",
    domain: "literature",
  },
  {
    text: "The engineer calculated the [MASK] needed to support the bridge's load.",
    answer: "tension",
    difficulty: "Medium",
    domain: "engineering",
  },
  {
    text: "The diplomat sought a peaceful [MASK] to the border dispute.",
    answer: "resolution",
    difficulty: "Medium",
    domain: "politics",
  },
  {
    text: "The composer wrote a [MASK] for strings and piano that premiered in Vienna.",
    answer: "sonata",
    difficulty: "Medium",
    domain: "music",
  },

  // ── Hard (10) ──────────────────────────────────────────────────────────────
  {
    text: "The philosopher argued that [MASK] is the foundation of all moral reasoning.",
    answer: "virtue",
    difficulty: "Hard",
    domain: "philosophy",
  },
  {
    text: "The quantum experiment demonstrated [MASK] between two entangled particles separated by vast distances.",
    answer: "correlation",
    difficulty: "Hard",
    domain: "physics",
  },
  {
    text: "The historian noted that the empire's [MASK] was accelerated by internal corruption and external pressure.",
    answer: "decline",
    difficulty: "Hard",
    domain: "history",
  },
  {
    text: "The linguist studied the [MASK] shift that transformed the vowel system of Middle English.",
    answer: "phonological",
    difficulty: "Hard",
    domain: "linguistics",
  },
  {
    text: "The economist argued that [MASK] externalities justify government intervention in carbon markets.",
    answer: "negative",
    difficulty: "Hard",
    domain: "economics",
  },
  {
    text: "The neuroscientist identified the [MASK] cortex as the region most active during spatial navigation.",
    answer: "parietal",
    difficulty: "Hard",
    domain: "neuroscience",
  },
  {
    text: "The legal scholar distinguished between [MASK] liability and negligence in tort law.",
    answer: "strict",
    difficulty: "Hard",
    domain: "law",
  },
  {
    text: "The algorithm achieved [MASK] convergence by adjusting the learning rate dynamically.",
    answer: "faster",
    difficulty: "Hard",
    domain: "machine learning",
  },
  {
    text: "The archaeologist dated the artifact using [MASK] dating based on radioactive decay.",
    answer: "carbon",
    difficulty: "Hard",
    domain: "archaeology",
  },
  {
    text: "The sociologist examined how [MASK] capital shapes access to education and social mobility.",
    answer: "cultural",
    difficulty: "Hard",
    domain: "sociology",
  },
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  let inserted = 0;
  let skipped = 0;

  for (const s of SENTENCES) {
    // Check for duplicate
    const [rows] = await conn.execute(
      "SELECT id FROM sentences WHERE text = ? AND bertCategory = 'cbow' LIMIT 1",
      [s.text]
    );
    if (rows.length > 0) {
      skipped++;
      continue;
    }

    // Compute word count for the answer (for blank placeholder rendering)
    const wordCount = s.answer.trim().split(/\s+/).length;

    await conn.execute(
      `INSERT INTO sentences (text, answer, difficulty, domain, bertCategory, gameMode, masks)
       VALUES (?, ?, ?, ?, 'cbow', 'classic', ?)`,
      [
        s.text,
        s.answer,
        s.difficulty,
        s.domain,
        JSON.stringify([s.answer]),
      ]
    );
    inserted++;
  }

  await conn.end();
  console.log(`✅  CBOW seed complete: ${inserted} inserted, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
