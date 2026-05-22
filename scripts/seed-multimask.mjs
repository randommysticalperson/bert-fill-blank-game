import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

/**
 * Multi-mask sentence bank.
 *
 * Each entry has:
 *   text       – sentence with 2+ [MASK] tokens
 *   masks      – ordered array of correct answers for each [MASK]
 *   answer     – first mask answer (backward compat)
 *   gameMode   – "consecutive" | "parallel"
 *   difficulty – "Easy" | "Medium" | "Hard"
 *   domain     – content domain
 *   bertCategory – which BERT model category
 *
 * Consecutive: blanks are revealed one at a time in order.
 * Parallel:    all blanks shown at once, filled independently.
 */
const sentences = [

  // ══════════════════════════════════════════════════════════════
  //  CONSECUTIVE — blanks revealed one at a time in order
  // ══════════════════════════════════════════════════════════════

  // ── General / Easy ──
  { text: "[MASK] and [MASK] are the two primary colours mixed to make green.", masks: ["blue","yellow"], answer: "blue", gameMode: "consecutive", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "A [MASK] has four [MASK].", masks: ["square","sides"], answer: "square", gameMode: "consecutive", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "The [MASK] is the capital of [MASK].", masks: ["London","England"], answer: "London", gameMode: "consecutive", difficulty: "Easy", domain: "geography", bertCategory: "general" },
  { text: "We breathe in [MASK] and breathe out [MASK].", masks: ["oxygen","carbon dioxide"], answer: "oxygen", gameMode: "consecutive", difficulty: "Easy", domain: "biology", bertCategory: "general" },
  { text: "A [MASK] has twelve [MASK] in a year.", masks: ["calendar","months"], answer: "calendar", gameMode: "consecutive", difficulty: "Easy", domain: "general", bertCategory: "general" },

  // ── General / Medium ──
  { text: "Isaac [MASK] formulated the law of universal [MASK].", masks: ["Newton","gravitation"], answer: "Newton", gameMode: "consecutive", difficulty: "Medium", domain: "science", bertCategory: "general" },
  { text: "The [MASK] War ended with the [MASK] Treaty in 1918.", masks: ["First World","Versailles"], answer: "First World", gameMode: "consecutive", difficulty: "Medium", domain: "history", bertCategory: "general" },
  { text: "Shakespeare was born in [MASK] and died in [MASK].", masks: ["1564","1616"], answer: "1564", gameMode: "consecutive", difficulty: "Medium", domain: "literature", bertCategory: "general" },
  { text: "The [MASK] is the powerhouse of the cell, producing [MASK] for energy.", masks: ["mitochondria","ATP"], answer: "mitochondria", gameMode: "consecutive", difficulty: "Medium", domain: "biology", bertCategory: "general" },
  { text: "The [MASK] Ocean lies between [MASK] and the Americas.", masks: ["Atlantic","Europe"], answer: "Atlantic", gameMode: "consecutive", difficulty: "Medium", domain: "geography", bertCategory: "general" },

  // ── General / Hard ──
  { text: "The [MASK] transform converts a signal from the [MASK] domain to the frequency domain.", masks: ["Fourier","time"], answer: "Fourier", gameMode: "consecutive", difficulty: "Hard", domain: "mathematics", bertCategory: "general" },
  { text: "The [MASK] paradox arises from the [MASK] principle of quantum superposition.", masks: ["Schrödinger's cat","measurement"], answer: "Schrödinger's cat", gameMode: "consecutive", difficulty: "Hard", domain: "physics", bertCategory: "general" },
  { text: "The [MASK] conjecture was proved by [MASK] in 2003.", masks: ["Poincaré","Perelman"], answer: "Poincaré", gameMode: "consecutive", difficulty: "Hard", domain: "mathematics", bertCategory: "general" },
  { text: "In [MASK] relativity, [MASK] and space are unified into a single continuum.", masks: ["general","time"], answer: "general", gameMode: "consecutive", difficulty: "Hard", domain: "physics", bertCategory: "general" },
  { text: "The [MASK] acid cycle is also known as the [MASK] cycle.", masks: ["citric","Krebs"], answer: "citric", gameMode: "consecutive", difficulty: "Hard", domain: "biochemistry", bertCategory: "general" },

  // ── Medical / Easy ──
  { text: "The [MASK] pumps [MASK] around the body.", masks: ["heart","blood"], answer: "heart", gameMode: "consecutive", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },
  { text: "A [MASK] is a doctor who specialises in [MASK] disorders.", masks: ["neurologist","nervous system"], answer: "neurologist", gameMode: "consecutive", difficulty: "Easy", domain: "medical", bertCategory: "medical" },
  { text: "The [MASK] and [MASK] are the two bones of the lower leg.", masks: ["tibia","fibula"], answer: "tibia", gameMode: "consecutive", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },

  // ── Medical / Medium ──
  { text: "Insulin is produced by the [MASK] and regulates [MASK] levels in the blood.", masks: ["pancreas","glucose"], answer: "pancreas", gameMode: "consecutive", difficulty: "Medium", domain: "endocrinology", bertCategory: "medical" },
  { text: "The [MASK] system includes the [MASK], spinal cord, and peripheral nerves.", masks: ["nervous","brain"], answer: "nervous", gameMode: "consecutive", difficulty: "Medium", domain: "anatomy", bertCategory: "medical" },
  { text: "Haemoglobin carries [MASK] from the [MASK] to body tissues.", masks: ["oxygen","lungs"], answer: "oxygen", gameMode: "consecutive", difficulty: "Medium", domain: "physiology", bertCategory: "medical" },

  // ── Medical / Hard ──
  { text: "CRISPR-[MASK]9 enables [MASK] editing at specific genomic loci.", masks: ["Cas","genome"], answer: "Cas", gameMode: "consecutive", difficulty: "Hard", domain: "genetics", bertCategory: "medical" },
  { text: "The [MASK] pathway regulates cell [MASK] and is frequently mutated in cancer.", masks: ["PI3K","survival"], answer: "PI3K", gameMode: "consecutive", difficulty: "Hard", domain: "molecular biology", bertCategory: "medical" },

  // ── Science / Easy ──
  { text: "The [MASK] is the closest [MASK] to Earth.", masks: ["Sun","star"], answer: "Sun", gameMode: "consecutive", difficulty: "Easy", domain: "astronomy", bertCategory: "science" },
  { text: "Plants absorb [MASK] and release [MASK] during photosynthesis.", masks: ["carbon dioxide","oxygen"], answer: "carbon dioxide", gameMode: "consecutive", difficulty: "Easy", domain: "biology", bertCategory: "science" },

  // ── Science / Medium ──
  { text: "Newton's second law states that [MASK] equals [MASK] times acceleration.", masks: ["force","mass"], answer: "force", gameMode: "consecutive", difficulty: "Medium", domain: "physics", bertCategory: "science" },
  { text: "DNA is a double [MASK] made of [MASK] and deoxyribose.", masks: ["helix","phosphate"], answer: "helix", gameMode: "consecutive", difficulty: "Medium", domain: "molecular biology", bertCategory: "science" },
  { text: "The [MASK] telescope orbits [MASK] and has captured deep-field images.", masks: ["Hubble","Earth"], answer: "Hubble", gameMode: "consecutive", difficulty: "Medium", domain: "astronomy", bertCategory: "science" },

  // ── Science / Hard ──
  { text: "The [MASK] principle states that no two [MASK] can share the same quantum state.", masks: ["Pauli exclusion","fermions"], answer: "Pauli exclusion", gameMode: "consecutive", difficulty: "Hard", domain: "quantum physics", bertCategory: "science" },
  { text: "The [MASK] equation governs the [MASK] function of a quantum system.", masks: ["Schrödinger","wave"], answer: "Schrödinger", gameMode: "consecutive", difficulty: "Hard", domain: "quantum physics", bertCategory: "science" },

  // ── Finance / Easy ──
  { text: "A [MASK] account earns [MASK] on deposited money.", masks: ["savings","interest"], answer: "savings", gameMode: "consecutive", difficulty: "Easy", domain: "banking", bertCategory: "finance" },
  { text: "A [MASK] is a share of [MASK] in a company.", masks: ["stock","ownership"], answer: "stock", gameMode: "consecutive", difficulty: "Easy", domain: "investing", bertCategory: "finance" },

  // ── Finance / Medium ──
  { text: "The [MASK] ratio compares a company's stock [MASK] to its earnings per share.", masks: ["price-to-earnings","price"], answer: "price-to-earnings", gameMode: "consecutive", difficulty: "Medium", domain: "valuation", bertCategory: "finance" },
  { text: "The [MASK] curve plots [MASK] rates against bond maturities.", masks: ["yield","interest"], answer: "yield", gameMode: "consecutive", difficulty: "Medium", domain: "fixed income", bertCategory: "finance" },

  // ── Finance / Hard ──
  { text: "The [MASK] theorem states that firm value is independent of [MASK] structure in a perfect market.", masks: ["Modigliani-Miller","capital"], answer: "Modigliani-Miller", gameMode: "consecutive", difficulty: "Hard", domain: "corporate finance", bertCategory: "finance" },
  { text: "The [MASK] model prices [MASK] using volatility, strike price, and time to expiry.", masks: ["Black-Scholes","options"], answer: "Black-Scholes", gameMode: "consecutive", difficulty: "Hard", domain: "derivatives", bertCategory: "finance" },

  // ── Legal / Easy ──
  { text: "A [MASK] is a legally binding [MASK] between two or more parties.", masks: ["contract","agreement"], answer: "contract", gameMode: "consecutive", difficulty: "Easy", domain: "contract law", bertCategory: "legal" },
  { text: "The [MASK] is the person accused in a [MASK] case.", masks: ["defendant","criminal"], answer: "defendant", gameMode: "consecutive", difficulty: "Easy", domain: "criminal law", bertCategory: "legal" },

  // ── Legal / Medium ──
  { text: "The [MASK] doctrine requires courts to follow [MASK] set by earlier decisions.", masks: ["stare decisis","precedents"], answer: "stare decisis", gameMode: "consecutive", difficulty: "Medium", domain: "jurisprudence", bertCategory: "legal" },
  { text: "The [MASK] privilege protects communications between a [MASK] and their attorney.", masks: ["attorney-client","client"], answer: "attorney-client", gameMode: "consecutive", difficulty: "Medium", domain: "evidence", bertCategory: "legal" },

  // ── Legal / Hard ──
  { text: "The [MASK] doctrine prevents a party from asserting a position [MASK] with one previously taken.", masks: ["estoppel","inconsistent"], answer: "estoppel", gameMode: "consecutive", difficulty: "Hard", domain: "equity", bertCategory: "legal" },
  { text: "The [MASK] Convention governs the international [MASK] of goods.", masks: ["Vienna","sale"], answer: "Vienna", gameMode: "consecutive", difficulty: "Hard", domain: "international trade law", bertCategory: "legal" },

  // ── Clinical / Easy ──
  { text: "A [MASK] is prescribed to fight a [MASK] infection.", masks: ["antibiotic","bacterial"], answer: "antibiotic", gameMode: "consecutive", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] records the [MASK] activity of the heart.", masks: ["ECG","electrical"], answer: "ECG", gameMode: "consecutive", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },

  // ── Clinical / Medium ──
  { text: "The patient presented with [MASK] dyspnoea and bilateral [MASK] oedema.", masks: ["exertional","leg"], answer: "exertional", gameMode: "consecutive", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient's [MASK] was elevated, indicating possible [MASK] impairment.", masks: ["creatinine","renal"], answer: "creatinine", gameMode: "consecutive", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },

  // ── Clinical / Hard ──
  { text: "Disseminated intravascular [MASK] is a life-threatening condition involving abnormal [MASK].", masks: ["coagulation","clotting"], answer: "coagulation", gameMode: "consecutive", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] score guides [MASK] decisions in atrial fibrillation.", masks: ["CHA2DS2-VASc","anticoagulation"], answer: "CHA2DS2-VASc", gameMode: "consecutive", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },

  // ══════════════════════════════════════════════════════════════
  //  PARALLEL — all blanks shown at once, filled independently
  // ══════════════════════════════════════════════════════════════

  // ── General / Easy ──
  { text: "[MASK] is the capital of France and [MASK] is the capital of Germany.", masks: ["Paris","Berlin"], answer: "Paris", gameMode: "parallel", difficulty: "Easy", domain: "geography", bertCategory: "general" },
  { text: "A [MASK] has four legs and a [MASK] has two legs.", masks: ["dog","human"], answer: "dog", gameMode: "parallel", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "The [MASK] is the largest planet and [MASK] is the smallest planet in the solar system.", masks: ["Jupiter","Mercury"], answer: "Jupiter", gameMode: "parallel", difficulty: "Easy", domain: "astronomy", bertCategory: "general" },
  { text: "Water boils at [MASK] degrees Celsius and freezes at [MASK] degrees Celsius.", masks: ["100","0"], answer: "100", gameMode: "parallel", difficulty: "Easy", domain: "science", bertCategory: "general" },
  { text: "[MASK] wrote Romeo and Juliet and [MASK] wrote Don Quixote.", masks: ["Shakespeare","Cervantes"], answer: "Shakespeare", gameMode: "parallel", difficulty: "Easy", domain: "literature", bertCategory: "general" },

  // ── General / Medium ──
  { text: "The [MASK] is the study of living organisms and [MASK] is the study of matter and energy.", masks: ["biology","physics"], answer: "biology", gameMode: "parallel", difficulty: "Medium", domain: "science", bertCategory: "general" },
  { text: "The [MASK] War ended in 1945 and the [MASK] War ended in 1953.", masks: ["Second World","Korean"], answer: "Second World", gameMode: "parallel", difficulty: "Medium", domain: "history", bertCategory: "general" },
  { text: "The [MASK] is the unit of force and the [MASK] is the unit of energy.", masks: ["newton","joule"], answer: "newton", gameMode: "parallel", difficulty: "Medium", domain: "physics", bertCategory: "general" },
  { text: "The [MASK] Ocean is the largest and the [MASK] Ocean is the smallest.", masks: ["Pacific","Arctic"], answer: "Pacific", gameMode: "parallel", difficulty: "Medium", domain: "geography", bertCategory: "general" },
  { text: "[MASK] discovered penicillin and [MASK] developed the polio vaccine.", masks: ["Fleming","Salk"], answer: "Fleming", gameMode: "parallel", difficulty: "Medium", domain: "history", bertCategory: "general" },

  // ── General / Hard ──
  { text: "The [MASK] transform decomposes signals and the [MASK] transform is its discrete counterpart.", masks: ["Fourier","DFT"], answer: "Fourier", gameMode: "parallel", difficulty: "Hard", domain: "mathematics", bertCategory: "general" },
  { text: "[MASK] proposed special relativity and [MASK] proposed quantum mechanics.", masks: ["Einstein","Planck"], answer: "Einstein", gameMode: "parallel", difficulty: "Hard", domain: "physics", bertCategory: "general" },
  { text: "The [MASK] paradox involves a cat and the [MASK] paradox involves a barber.", masks: ["Schrödinger","Russell"], answer: "Schrödinger", gameMode: "parallel", difficulty: "Hard", domain: "philosophy", bertCategory: "general" },

  // ── Medical / Easy ──
  { text: "The [MASK] is on the left side of the chest and the [MASK] is on the right side.", masks: ["heart","liver"], answer: "heart", gameMode: "parallel", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },
  { text: "Red blood cells carry [MASK] and white blood cells fight [MASK].", masks: ["oxygen","infection"], answer: "oxygen", gameMode: "parallel", difficulty: "Easy", domain: "physiology", bertCategory: "medical" },

  // ── Medical / Medium ──
  { text: "The [MASK] produces insulin and the [MASK] produces bile.", masks: ["pancreas","liver"], answer: "pancreas", gameMode: "parallel", difficulty: "Medium", domain: "anatomy", bertCategory: "medical" },
  { text: "A [MASK] scan uses X-rays and an [MASK] scan uses magnetic fields.", masks: ["CT","MRI"], answer: "CT", gameMode: "parallel", difficulty: "Medium", domain: "radiology", bertCategory: "medical" },
  { text: "The [MASK] system regulates hormones and the [MASK] system defends against pathogens.", masks: ["endocrine","immune"], answer: "endocrine", gameMode: "parallel", difficulty: "Medium", domain: "physiology", bertCategory: "medical" },

  // ── Medical / Hard ──
  { text: "CRISPR-[MASK]9 edits [MASK] at specific locations in the genome.", masks: ["Cas","DNA"], answer: "Cas", gameMode: "parallel", difficulty: "Hard", domain: "genetics", bertCategory: "medical" },
  { text: "Statins inhibit [MASK]-CoA reductase and [MASK] antibodies target PD-1.", masks: ["HMG","monoclonal"], answer: "HMG", gameMode: "parallel", difficulty: "Hard", domain: "pharmacology", bertCategory: "medical" },

  // ── Science / Easy ──
  { text: "The [MASK] is the closest star and [MASK] is the closest planet to Earth.", masks: ["Sun","Venus"], answer: "Sun", gameMode: "parallel", difficulty: "Easy", domain: "astronomy", bertCategory: "science" },
  { text: "Plants make food through [MASK] and animals get energy through [MASK].", masks: ["photosynthesis","respiration"], answer: "photosynthesis", gameMode: "parallel", difficulty: "Easy", domain: "biology", bertCategory: "science" },

  // ── Science / Medium ──
  { text: "The [MASK] bond shares electrons and the [MASK] bond transfers electrons.", masks: ["covalent","ionic"], answer: "covalent", gameMode: "parallel", difficulty: "Medium", domain: "chemistry", bertCategory: "science" },
  { text: "The [MASK] is the unit of current and the [MASK] is the unit of voltage.", masks: ["ampere","volt"], answer: "ampere", gameMode: "parallel", difficulty: "Medium", domain: "physics", bertCategory: "science" },
  { text: "The [MASK] telescope is in orbit and the [MASK] telescope is on the ground in Chile.", masks: ["Hubble","VLT"], answer: "Hubble", gameMode: "parallel", difficulty: "Medium", domain: "astronomy", bertCategory: "science" },

  // ── Science / Hard ──
  { text: "The [MASK] principle limits precision and the [MASK] principle forbids identical fermion states.", masks: ["uncertainty","Pauli exclusion"], answer: "uncertainty", gameMode: "parallel", difficulty: "Hard", domain: "quantum physics", bertCategory: "science" },
  { text: "The [MASK] force binds quarks and the [MASK] force causes radioactive decay.", masks: ["strong nuclear","weak nuclear"], answer: "strong nuclear", gameMode: "parallel", difficulty: "Hard", domain: "particle physics", bertCategory: "science" },

  // ── Finance / Easy ──
  { text: "A [MASK] is a share of equity and a [MASK] is a fixed-income instrument.", masks: ["stock","bond"], answer: "stock", gameMode: "parallel", difficulty: "Easy", domain: "investing", bertCategory: "finance" },
  { text: "The [MASK] is the profit after expenses and the [MASK] is the total income.", masks: ["net income","revenue"], answer: "net income", gameMode: "parallel", difficulty: "Easy", domain: "accounting", bertCategory: "finance" },

  // ── Finance / Medium ──
  { text: "The [MASK] ratio measures valuation and the [MASK] ratio measures liquidity.", masks: ["P/E","current"], answer: "P/E", gameMode: "parallel", difficulty: "Medium", domain: "analysis", bertCategory: "finance" },
  { text: "The [MASK] curve shows bond yields and the [MASK] spread shows credit risk.", masks: ["yield","credit"], answer: "yield", gameMode: "parallel", difficulty: "Medium", domain: "fixed income", bertCategory: "finance" },

  // ── Finance / Hard ──
  { text: "The [MASK] theorem concerns capital structure and the [MASK] model prices options.", masks: ["Modigliani-Miller","Black-Scholes"], answer: "Modigliani-Miller", gameMode: "parallel", difficulty: "Hard", domain: "finance theory", bertCategory: "finance" },
  { text: "The [MASK] hypothesis claims markets are efficient and the [MASK] model adds size and value factors.", masks: ["efficient market","Fama-French"], answer: "efficient market", gameMode: "parallel", difficulty: "Hard", domain: "asset pricing", bertCategory: "finance" },

  // ── Legal / Easy ──
  { text: "The [MASK] is the accused and the [MASK] is the accuser in a criminal trial.", masks: ["defendant","prosecutor"], answer: "defendant", gameMode: "parallel", difficulty: "Easy", domain: "criminal law", bertCategory: "legal" },
  { text: "A [MASK] is a court order and a [MASK] is a written law passed by parliament.", masks: ["injunction","statute"], answer: "injunction", gameMode: "parallel", difficulty: "Easy", domain: "law", bertCategory: "legal" },

  // ── Legal / Medium ──
  { text: "The [MASK] doctrine follows precedent and the [MASK] privilege protects client communications.", masks: ["stare decisis","attorney-client"], answer: "stare decisis", gameMode: "parallel", difficulty: "Medium", domain: "jurisprudence", bertCategory: "legal" },
  { text: "A [MASK] trust arises by operation of law and a [MASK] trust is expressly created.", masks: ["constructive","express"], answer: "constructive", gameMode: "parallel", difficulty: "Medium", domain: "equity", bertCategory: "legal" },

  // ── Legal / Hard ──
  { text: "The [MASK] doctrine prevents inconsistent positions and the [MASK] rule excludes illegally obtained evidence.", masks: ["estoppel","exclusionary"], answer: "estoppel", gameMode: "parallel", difficulty: "Hard", domain: "evidence", bertCategory: "legal" },
  { text: "The [MASK] Convention governs the sale of goods and the [MASK] Convention governs arbitration.", masks: ["Vienna","New York"], answer: "Vienna", gameMode: "parallel", difficulty: "Hard", domain: "international law", bertCategory: "legal" },

  // ── Clinical / Easy ──
  { text: "A [MASK] is prescribed for bacterial infections and a [MASK] is prescribed for viral infections.", masks: ["antibiotic","antiviral"], answer: "antibiotic", gameMode: "parallel", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] measures heart rhythm and the [MASK] measures blood oxygen.", masks: ["ECG","pulse oximeter"], answer: "ECG", gameMode: "parallel", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },

  // ── Clinical / Medium ──
  { text: "The patient's [MASK] was elevated and [MASK] was decreased, suggesting renal failure.", masks: ["creatinine","GFR"], answer: "creatinine", gameMode: "parallel", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] score assesses sepsis and the [MASK] score assesses stroke risk.", masks: ["SOFA","CHA2DS2-VASc"], answer: "SOFA", gameMode: "parallel", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },

  // ── Clinical / Hard ──
  { text: "The patient had a widened [MASK] gap and a raised [MASK] level, indicating metabolic acidosis.", masks: ["anion","lactate"], answer: "anion", gameMode: "parallel", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "Troponin [MASK] indicates myocardial injury and [MASK] indicates heart failure.", masks: ["I","BNP"], answer: "I", gameMode: "parallel", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
];

async function seed() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  let inserted = 0;
  for (const s of sentences) {
    await connection.execute(
      `INSERT INTO sentences (text, answer, masks, gameMode, difficulty, domain, bertCategory)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.text, s.answer, JSON.stringify(s.masks), s.gameMode, s.difficulty, s.domain, s.bertCategory]
    );
    inserted++;
  }

  const byMode = {};
  for (const s of sentences) {
    byMode[s.gameMode] = (byMode[s.gameMode] || 0) + 1;
  }

  console.log(`✅ Seeded ${inserted} multi-mask sentences.`);
  console.log("  Breakdown by gameMode:");
  for (const [mode, count] of Object.entries(byMode)) {
    console.log(`    ${mode.padEnd(12)} ${count} sentences`);
  }
  await connection.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
