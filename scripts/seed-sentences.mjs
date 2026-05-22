import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const sentences = [
  // ── Easy ──────────────────────────────────────────────────────────────────
  { text: "The [MASK] is the closest star to Earth.", answer: "Sun", difficulty: "Easy", domain: "science" },
  { text: "Water freezes at [MASK] degrees Celsius.", answer: "zero", difficulty: "Easy", domain: "science" },
  { text: "A [MASK] has eight legs.", answer: "spider", difficulty: "Easy", domain: "biology" },
  { text: "The capital of France is [MASK].", answer: "Paris", difficulty: "Easy", domain: "geography" },
  { text: "Humans have [MASK] senses: sight, hearing, smell, taste, and touch.", answer: "five", difficulty: "Easy", domain: "biology" },
  { text: "The [MASK] is the largest ocean on Earth.", answer: "Pacific", difficulty: "Easy", domain: "geography" },
  { text: "A [MASK] is a young dog.", answer: "puppy", difficulty: "Easy", domain: "general" },
  { text: "The color of the sky on a clear day is [MASK].", answer: "blue", difficulty: "Easy", domain: "general" },
  { text: "Bees produce [MASK] as food.", answer: "honey", difficulty: "Easy", domain: "biology" },
  { text: "The [MASK] is the organ responsible for pumping blood through the body.", answer: "heart", difficulty: "Easy", domain: "biology" },

  // ── Medium ────────────────────────────────────────────────────────────────
  { text: "The theory of [MASK] was proposed by Charles Darwin.", answer: "evolution", difficulty: "Medium", domain: "science" },
  { text: "The chemical symbol for [MASK] is Au.", answer: "gold", difficulty: "Medium", domain: "chemistry" },
  { text: "Shakespeare wrote the play [MASK] about a Danish prince.", answer: "Hamlet", difficulty: "Medium", domain: "literature" },
  { text: "The [MASK] War lasted from 1939 to 1945.", answer: "Second World", difficulty: "Medium", domain: "history" },
  { text: "The speed of [MASK] in a vacuum is approximately 299,792 kilometres per second.", answer: "light", difficulty: "Medium", domain: "physics" },
  { text: "The [MASK] is the powerhouse of the cell.", answer: "mitochondria", difficulty: "Medium", domain: "biology" },
  { text: "Leonardo da Vinci painted the [MASK].", answer: "Mona Lisa", difficulty: "Medium", domain: "art" },
  { text: "The Amazon River flows through the country of [MASK].", answer: "Brazil", difficulty: "Medium", domain: "geography" },
  { text: "The periodic table was created by Dmitri [MASK].", answer: "Mendeleev", difficulty: "Medium", domain: "chemistry" },
  { text: "Isaac Newton formulated the law of universal [MASK].", answer: "gravitation", difficulty: "Medium", domain: "physics" },

  // ── Hard ──────────────────────────────────────────────────────────────────
  { text: "The [MASK] conjecture, one of the Millennium Prize Problems, concerns the distribution of prime numbers.", answer: "Riemann", difficulty: "Hard", domain: "mathematics" },
  { text: "The process by which plants convert sunlight into chemical energy is called [MASK].", answer: "photosynthesis", difficulty: "Hard", domain: "biology" },
  { text: "The [MASK] effect describes the change in frequency of a wave relative to an observer moving relative to the source.", answer: "Doppler", difficulty: "Hard", domain: "physics" },
  { text: "In quantum mechanics, the [MASK] principle states that certain pairs of physical properties cannot both be known precisely at the same time.", answer: "uncertainty", difficulty: "Hard", domain: "physics" },
  { text: "The philosopher Immanuel Kant introduced the concept of the [MASK] imperative as a central principle of moral philosophy.", answer: "categorical", difficulty: "Hard", domain: "philosophy" },
  { text: "The [MASK] acid cycle, also known as the Krebs cycle, is a series of chemical reactions used by aerobic organisms.", answer: "citric", difficulty: "Hard", domain: "biochemistry" },
  { text: "The Treaty of [MASK] in 1648 ended the Thirty Years' War and established the modern concept of state sovereignty.", answer: "Westphalia", difficulty: "Hard", domain: "history" },
  { text: "In linguistics, the [MASK] hypothesis proposes that the language you speak influences the way you think.", answer: "Sapir-Whorf", difficulty: "Hard", domain: "linguistics" },
  { text: "The [MASK] transform is a mathematical operation that decomposes a function into its constituent frequencies.", answer: "Fourier", difficulty: "Hard", domain: "mathematics" },
  { text: "The [MASK] paradox highlights a contradiction between high estimates of the probability of extraterrestrial civilisations and the lack of evidence for them.", answer: "Fermi", difficulty: "Hard", domain: "astronomy" },
];

async function seed() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  // Clear existing sentences
  await connection.execute("DELETE FROM sentences");

  // Insert all sentences
  for (const s of sentences) {
    await connection.execute(
      "INSERT INTO sentences (text, answer, difficulty, domain) VALUES (?, ?, ?, ?)",
      [s.text, s.answer, s.difficulty, s.domain]
    );
  }

  console.log(`✅ Seeded ${sentences.length} sentences.`);
  await connection.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
