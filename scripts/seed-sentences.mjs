import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

/**
 * Sentence bank — each sentence belongs to a bertCategory that matches the
 * BERT model selector in the UI (general / medical / clinical / science /
 * finance / legal).  Each category has sentences at all three difficulty
 * levels so the game can always serve 10 questions regardless of which
 * model + difficulty combination the player picks.
 */
const sentences = [

  // ════════════════════════════════════════════════════════════════
  //  GENERAL  (Google BERT — broad everyday language)
  // ════════════════════════════════════════════════════════════════
  { text: "A [MASK] is a young dog.", answer: "puppy", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "The color of the sky on a clear day is [MASK].", answer: "blue", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "You use a [MASK] to cut bread.", answer: "knife", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "A [MASK] is used to tell the time.", answer: "clock", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "The opposite of hot is [MASK].", answer: "cold", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "We use an [MASK] to send messages electronically.", answer: "email", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "A [MASK] is a place where books are kept and borrowed.", answer: "library", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "The capital of France is [MASK].", answer: "Paris", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "Ice is [MASK] that has frozen solid.", answer: "water", difficulty: "Easy", domain: "general", bertCategory: "general" },
  { text: "A [MASK] is a round shape with no corners.", answer: "circle", difficulty: "Easy", domain: "general", bertCategory: "general" },

  { text: "The theory of [MASK] was proposed by Charles Darwin.", answer: "evolution", difficulty: "Medium", domain: "science", bertCategory: "general" },
  { text: "Shakespeare wrote the play [MASK] about a Danish prince.", answer: "Hamlet", difficulty: "Medium", domain: "literature", bertCategory: "general" },
  { text: "The Amazon River flows through the country of [MASK].", answer: "Brazil", difficulty: "Medium", domain: "geography", bertCategory: "general" },
  { text: "Leonardo da Vinci painted the [MASK].", answer: "Mona Lisa", difficulty: "Medium", domain: "art", bertCategory: "general" },
  { text: "The chemical symbol for [MASK] is Au.", answer: "gold", difficulty: "Medium", domain: "chemistry", bertCategory: "general" },
  { text: "The [MASK] War lasted from 1939 to 1945.", answer: "Second World", difficulty: "Medium", domain: "history", bertCategory: "general" },
  { text: "The speed of [MASK] in a vacuum is approximately 299,792 kilometres per second.", answer: "light", difficulty: "Medium", domain: "physics", bertCategory: "general" },
  { text: "The periodic table was created by Dmitri [MASK].", answer: "Mendeleev", difficulty: "Medium", domain: "chemistry", bertCategory: "general" },
  { text: "Isaac Newton formulated the law of universal [MASK].", answer: "gravitation", difficulty: "Medium", domain: "physics", bertCategory: "general" },
  { text: "The [MASK] is the powerhouse of the cell.", answer: "mitochondria", difficulty: "Medium", domain: "biology", bertCategory: "general" },

  { text: "The [MASK] conjecture concerns the distribution of prime numbers.", answer: "Riemann", difficulty: "Hard", domain: "mathematics", bertCategory: "general" },
  { text: "The [MASK] effect describes the change in frequency of a wave relative to a moving observer.", answer: "Doppler", difficulty: "Hard", domain: "physics", bertCategory: "general" },
  { text: "In quantum mechanics, the [MASK] principle states that certain pairs of properties cannot both be known precisely.", answer: "uncertainty", difficulty: "Hard", domain: "physics", bertCategory: "general" },
  { text: "The philosopher Immanuel Kant introduced the concept of the [MASK] imperative.", answer: "categorical", difficulty: "Hard", domain: "philosophy", bertCategory: "general" },
  { text: "The Treaty of [MASK] in 1648 ended the Thirty Years' War.", answer: "Westphalia", difficulty: "Hard", domain: "history", bertCategory: "general" },
  { text: "In linguistics, the [MASK] hypothesis proposes that language influences thought.", answer: "Sapir-Whorf", difficulty: "Hard", domain: "linguistics", bertCategory: "general" },
  { text: "The [MASK] transform decomposes a function into its constituent frequencies.", answer: "Fourier", difficulty: "Hard", domain: "mathematics", bertCategory: "general" },
  { text: "The [MASK] paradox highlights the contradiction between estimates of alien civilisations and the lack of evidence.", answer: "Fermi", difficulty: "Hard", domain: "astronomy", bertCategory: "general" },
  { text: "The [MASK] acid cycle, also known as the Krebs cycle, is used by aerobic organisms.", answer: "citric", difficulty: "Hard", domain: "biochemistry", bertCategory: "general" },
  { text: "The process by which plants convert sunlight into chemical energy is called [MASK].", answer: "photosynthesis", difficulty: "Hard", domain: "biology", bertCategory: "general" },

  // ════════════════════════════════════════════════════════════════
  //  MEDICAL  (BiomedBERT — PubMed abstracts)
  // ════════════════════════════════════════════════════════════════
  { text: "The [MASK] is the organ responsible for pumping blood through the body.", answer: "heart", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },
  { text: "Doctors use a [MASK] to listen to a patient's heartbeat.", answer: "stethoscope", difficulty: "Easy", domain: "medical", bertCategory: "medical" },
  { text: "A [MASK] is a small tablet taken orally to treat illness.", answer: "pill", difficulty: "Easy", domain: "medical", bertCategory: "medical" },
  { text: "The [MASK] is the largest organ in the human body.", answer: "skin", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },
  { text: "Humans have [MASK] senses: sight, hearing, smell, taste, and touch.", answer: "five", difficulty: "Easy", domain: "biology", bertCategory: "medical" },
  { text: "A [MASK] is a medical professional who performs surgical operations.", answer: "surgeon", difficulty: "Easy", domain: "medical", bertCategory: "medical" },
  { text: "The [MASK] system includes the brain, spinal cord, and nerves.", answer: "nervous", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },
  { text: "Red blood cells carry [MASK] around the body.", answer: "oxygen", difficulty: "Easy", domain: "physiology", bertCategory: "medical" },
  { text: "A [MASK] is a rise in body temperature above the normal range.", answer: "fever", difficulty: "Easy", domain: "medical", bertCategory: "medical" },
  { text: "The [MASK] is the bone that protects the brain.", answer: "skull", difficulty: "Easy", domain: "anatomy", bertCategory: "medical" },

  { text: "Insulin is produced by the [MASK] to regulate blood glucose levels.", answer: "pancreas", difficulty: "Medium", domain: "endocrinology", bertCategory: "medical" },
  { text: "The [MASK] is a chronic condition characterised by elevated blood sugar.", answer: "diabetes", difficulty: "Medium", domain: "endocrinology", bertCategory: "medical" },
  { text: "Aspirin is commonly used to reduce [MASK] and relieve pain.", answer: "inflammation", difficulty: "Medium", domain: "pharmacology", bertCategory: "medical" },
  { text: "The [MASK] valve separates the left atrium from the left ventricle.", answer: "mitral", difficulty: "Medium", domain: "cardiology", bertCategory: "medical" },
  { text: "A [MASK] scan uses magnetic fields to produce detailed images of internal organs.", answer: "MRI", difficulty: "Medium", domain: "radiology", bertCategory: "medical" },
  { text: "The [MASK] system defends the body against pathogens and foreign substances.", answer: "immune", difficulty: "Medium", domain: "immunology", bertCategory: "medical" },
  { text: "Haemoglobin is the protein in red blood cells that binds to [MASK].", answer: "oxygen", difficulty: "Medium", domain: "biochemistry", bertCategory: "medical" },
  { text: "The [MASK] gland in the neck regulates metabolism through hormone secretion.", answer: "thyroid", difficulty: "Medium", domain: "endocrinology", bertCategory: "medical" },
  { text: "A [MASK] is a benign or malignant mass of abnormally growing cells.", answer: "tumour", difficulty: "Medium", domain: "oncology", bertCategory: "medical" },
  { text: "The [MASK] is the primary site of drug metabolism in the body.", answer: "liver", difficulty: "Medium", domain: "pharmacology", bertCategory: "medical" },

  { text: "The [MASK] hypothesis proposes that cancer arises from mutations in somatic cells.", answer: "somatic", difficulty: "Hard", domain: "oncology", bertCategory: "medical" },
  { text: "Apoptosis is the process of programmed [MASK] death.", answer: "cell", difficulty: "Hard", domain: "cell biology", bertCategory: "medical" },
  { text: "The [MASK] pathway is a major intracellular signalling cascade involved in cell survival.", answer: "PI3K", difficulty: "Hard", domain: "molecular biology", bertCategory: "medical" },
  { text: "Monoclonal [MASK] are laboratory-produced molecules that mimic the immune system's ability to fight pathogens.", answer: "antibodies", difficulty: "Hard", domain: "immunology", bertCategory: "medical" },
  { text: "The [MASK] chain reaction is used to amplify small segments of DNA for diagnostic purposes.", answer: "polymerase", difficulty: "Hard", domain: "molecular biology", bertCategory: "medical" },
  { text: "Statins inhibit [MASK]-CoA reductase to lower cholesterol synthesis.", answer: "HMG", difficulty: "Hard", domain: "pharmacology", bertCategory: "medical" },
  { text: "The [MASK] reflex arc involves a sensory neuron, interneuron, and motor neuron.", answer: "spinal", difficulty: "Hard", domain: "neurology", bertCategory: "medical" },
  { text: "Epigenetic modifications alter gene expression without changing the [MASK] sequence.", answer: "DNA", difficulty: "Hard", domain: "genetics", bertCategory: "medical" },
  { text: "The [MASK] is the study of the distribution and determinants of health-related states in populations.", answer: "epidemiology", difficulty: "Hard", domain: "public health", bertCategory: "medical" },
  { text: "CRISPR-[MASK]9 is a genome-editing tool derived from a bacterial immune mechanism.", answer: "Cas", difficulty: "Hard", domain: "genetics", bertCategory: "medical" },

  // ════════════════════════════════════════════════════════════════
  //  CLINICAL  (Bio_ClinicalBERT — MIMIC-III clinical notes)
  // ════════════════════════════════════════════════════════════════
  { text: "The patient was admitted to the [MASK] for overnight observation.", answer: "ward", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "A nurse checks the patient's [MASK] to measure the force of blood against artery walls.", answer: "blood pressure", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The doctor ordered a blood [MASK] to check the patient's glucose levels.", answer: "test", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient reported [MASK] in the chest that worsened with deep breathing.", answer: "pain", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] room is where emergency patients receive immediate care.", answer: "emergency", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "A [MASK] is prescribed to fight a bacterial infection.", answer: "antibiotic", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient's [MASK] rate was 72 beats per minute at rest.", answer: "heart", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] is used to record the electrical activity of the heart.", answer: "ECG", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient was placed on [MASK] therapy to help with breathing.", answer: "oxygen", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },
  { text: "A [MASK] is a healthcare professional who prepares and dispenses medications.", answer: "pharmacist", difficulty: "Easy", domain: "clinical", bertCategory: "clinical" },

  { text: "The patient presented with [MASK] dyspnoea and bilateral leg oedema.", answer: "exertional", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] score is used to assess the severity of sepsis in the ICU.", answer: "SOFA", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient was started on [MASK] therapy following a diagnosis of atrial fibrillation.", answer: "anticoagulation", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "A [MASK] biopsy was performed to confirm the diagnosis of malignancy.", answer: "core needle", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient's [MASK] was elevated, indicating possible renal impairment.", answer: "creatinine", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "Post-operative [MASK] is a common complication following abdominal surgery.", answer: "ileus", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient was intubated and placed on [MASK] ventilation in the ICU.", answer: "mechanical", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "A [MASK] catheter was inserted to monitor central venous pressure.", answer: "central venous", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient's [MASK] gap was widened, suggesting metabolic acidosis.", answer: "anion", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },
  { text: "The chest X-ray showed bilateral [MASK] infiltrates consistent with pneumonia.", answer: "pulmonary", difficulty: "Medium", domain: "clinical", bertCategory: "clinical" },

  { text: "The patient was diagnosed with [MASK] encephalopathy secondary to hepatic failure.", answer: "hepatic", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "Troponin [MASK] is a highly sensitive biomarker for myocardial injury.", answer: "I", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient developed [MASK] syndrome after prolonged immobilisation.", answer: "refeeding", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "A [MASK] puncture was performed to analyse cerebrospinal fluid.", answer: "lumbar", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient's [MASK] fraction was reduced to 35%, indicating systolic dysfunction.", answer: "ejection", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "Disseminated intravascular [MASK] is a life-threatening condition involving abnormal clotting.", answer: "coagulation", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient was started on [MASK] therapy for Clostridioides difficile colitis.", answer: "vancomycin", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "The [MASK] score guides anticoagulation decisions in atrial fibrillation.", answer: "CHA2DS2-VASc", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "The patient's [MASK] level was critically low, requiring urgent potassium replacement.", answer: "potassium", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },
  { text: "Acute [MASK] injury was staged using the KDIGO criteria based on creatinine rise.", answer: "kidney", difficulty: "Hard", domain: "clinical", bertCategory: "clinical" },

  // ════════════════════════════════════════════════════════════════
  //  SCIENCE  (SciBERT — 1.14M scientific papers, Allen AI)
  // ════════════════════════════════════════════════════════════════
  { text: "The [MASK] is the closest star to Earth.", answer: "Sun", difficulty: "Easy", domain: "astronomy", bertCategory: "science" },
  { text: "Water freezes at [MASK] degrees Celsius.", answer: "zero", difficulty: "Easy", domain: "physics", bertCategory: "science" },
  { text: "A [MASK] has eight legs.", answer: "spider", difficulty: "Easy", domain: "biology", bertCategory: "science" },
  { text: "Bees produce [MASK] as food.", answer: "honey", difficulty: "Easy", domain: "biology", bertCategory: "science" },
  { text: "The [MASK] is the largest ocean on Earth.", answer: "Pacific", difficulty: "Easy", domain: "geography", bertCategory: "science" },
  { text: "Plants use [MASK] from the air to make food through photosynthesis.", answer: "carbon dioxide", difficulty: "Easy", domain: "biology", bertCategory: "science" },
  { text: "The [MASK] is the unit of electrical resistance.", answer: "ohm", difficulty: "Easy", domain: "physics", bertCategory: "science" },
  { text: "A [MASK] is a scientist who studies living organisms.", answer: "biologist", difficulty: "Easy", domain: "science", bertCategory: "science" },
  { text: "The [MASK] is the smallest unit of matter that retains the properties of an element.", answer: "atom", difficulty: "Easy", domain: "chemistry", bertCategory: "science" },
  { text: "The force that pulls objects towards the Earth is called [MASK].", answer: "gravity", difficulty: "Easy", domain: "physics", bertCategory: "science" },

  { text: "The [MASK] model describes the atom as a nucleus surrounded by electron shells.", answer: "Bohr", difficulty: "Medium", domain: "chemistry", bertCategory: "science" },
  { text: "The [MASK] constant relates the energy of a photon to its frequency.", answer: "Planck", difficulty: "Medium", domain: "physics", bertCategory: "science" },
  { text: "DNA is a double [MASK] structure first described by Watson and Crick.", answer: "helix", difficulty: "Medium", domain: "molecular biology", bertCategory: "science" },
  { text: "The [MASK] number of an element equals the number of protons in its nucleus.", answer: "atomic", difficulty: "Medium", domain: "chemistry", bertCategory: "science" },
  { text: "Newton's second law states that force equals mass times [MASK].", answer: "acceleration", difficulty: "Medium", domain: "physics", bertCategory: "science" },
  { text: "The [MASK] is the SI unit of electric current.", answer: "ampere", difficulty: "Medium", domain: "physics", bertCategory: "science" },
  { text: "In chemistry, a [MASK] is a substance that speeds up a reaction without being consumed.", answer: "catalyst", difficulty: "Medium", domain: "chemistry", bertCategory: "science" },
  { text: "The [MASK] telescope was launched in 1990 and orbits Earth.", answer: "Hubble", difficulty: "Medium", domain: "astronomy", bertCategory: "science" },
  { text: "The [MASK] layer in the atmosphere absorbs harmful ultraviolet radiation.", answer: "ozone", difficulty: "Medium", domain: "atmospheric science", bertCategory: "science" },
  { text: "The [MASK] bond is formed when two atoms share a pair of electrons.", answer: "covalent", difficulty: "Medium", domain: "chemistry", bertCategory: "science" },

  { text: "The [MASK] principle states that no two fermions can occupy the same quantum state simultaneously.", answer: "Pauli exclusion", difficulty: "Hard", domain: "quantum physics", bertCategory: "science" },
  { text: "In general relativity, massive objects cause a curvature of [MASK].", answer: "spacetime", difficulty: "Hard", domain: "physics", bertCategory: "science" },
  { text: "The [MASK] radiation is the thermal radiation left over from the Big Bang.", answer: "cosmic microwave background", difficulty: "Hard", domain: "cosmology", bertCategory: "science" },
  { text: "The [MASK] equation describes the wave function of a quantum mechanical system.", answer: "Schrödinger", difficulty: "Hard", domain: "quantum physics", bertCategory: "science" },
  { text: "CRISPR-Cas9 enables precise [MASK] editing by cutting DNA at specific locations.", answer: "genome", difficulty: "Hard", domain: "genetics", bertCategory: "science" },
  { text: "The [MASK] force is responsible for holding quarks together inside protons and neutrons.", answer: "strong nuclear", difficulty: "Hard", domain: "particle physics", bertCategory: "science" },
  { text: "The [MASK] effect is the emission of electrons from a material when light shines on it.", answer: "photoelectric", difficulty: "Hard", domain: "physics", bertCategory: "science" },
  { text: "In thermodynamics, [MASK] is a measure of the disorder or randomness of a system.", answer: "entropy", difficulty: "Hard", domain: "physics", bertCategory: "science" },
  { text: "The [MASK] number in fluid dynamics describes the ratio of inertial to viscous forces.", answer: "Reynolds", difficulty: "Hard", domain: "fluid dynamics", bertCategory: "science" },
  { text: "The [MASK] conjecture, proved by Perelman, classifies three-dimensional manifolds.", answer: "Poincaré", difficulty: "Hard", domain: "mathematics", bertCategory: "science" },

  // ════════════════════════════════════════════════════════════════
  //  FINANCE  (FinBERT — financial text)
  // ════════════════════════════════════════════════════════════════
  { text: "A [MASK] account earns interest on deposited money.", answer: "savings", difficulty: "Easy", domain: "banking", bertCategory: "finance" },
  { text: "The [MASK] is the amount of money a company earns after all expenses.", answer: "profit", difficulty: "Easy", domain: "accounting", bertCategory: "finance" },
  { text: "A [MASK] is a loan used to purchase a property.", answer: "mortgage", difficulty: "Easy", domain: "banking", bertCategory: "finance" },
  { text: "The [MASK] is the percentage of a loan charged as interest per year.", answer: "interest rate", difficulty: "Easy", domain: "banking", bertCategory: "finance" },
  { text: "A [MASK] is a share of ownership in a company.", answer: "stock", difficulty: "Easy", domain: "investing", bertCategory: "finance" },
  { text: "The [MASK] is the total value of a company's outstanding shares.", answer: "market capitalisation", difficulty: "Easy", domain: "investing", bertCategory: "finance" },
  { text: "A [MASK] is a fixed-income instrument that represents a loan made by an investor to a borrower.", answer: "bond", difficulty: "Easy", domain: "investing", bertCategory: "finance" },
  { text: "The [MASK] is the difference between a company's assets and its liabilities.", answer: "equity", difficulty: "Easy", domain: "accounting", bertCategory: "finance" },
  { text: "Inflation measures the rate at which the general level of [MASK] rises over time.", answer: "prices", difficulty: "Easy", domain: "economics", bertCategory: "finance" },
  { text: "A [MASK] fund pools money from many investors to purchase a diversified portfolio.", answer: "mutual", difficulty: "Easy", domain: "investing", bertCategory: "finance" },

  { text: "The [MASK] ratio compares a company's stock price to its earnings per share.", answer: "price-to-earnings", difficulty: "Medium", domain: "valuation", bertCategory: "finance" },
  { text: "A [MASK] swap is a derivative contract in which two parties exchange interest rate cash flows.", answer: "interest rate", difficulty: "Medium", domain: "derivatives", bertCategory: "finance" },
  { text: "The [MASK] curve plots interest rates against maturities for bonds of equal credit quality.", answer: "yield", difficulty: "Medium", domain: "fixed income", bertCategory: "finance" },
  { text: "A company's [MASK] ratio measures its ability to pay short-term obligations.", answer: "current", difficulty: "Medium", domain: "accounting", bertCategory: "finance" },
  { text: "The [MASK] model prices options based on the underlying asset price, strike, time, volatility, and risk-free rate.", answer: "Black-Scholes", difficulty: "Medium", domain: "derivatives", bertCategory: "finance" },
  { text: "Quantitative [MASK] refers to the central bank's purchase of financial assets to inject money into the economy.", answer: "easing", difficulty: "Medium", domain: "monetary policy", bertCategory: "finance" },
  { text: "A [MASK] fund seeks to profit from both rising and falling markets using leverage and short selling.", answer: "hedge", difficulty: "Medium", domain: "investing", bertCategory: "finance" },
  { text: "The [MASK] is the return on an investment relative to its cost.", answer: "ROI", difficulty: "Medium", domain: "investing", bertCategory: "finance" },
  { text: "The [MASK] spread is the difference in yield between a corporate bond and a risk-free government bond.", answer: "credit", difficulty: "Medium", domain: "fixed income", bertCategory: "finance" },
  { text: "A [MASK] order instructs a broker to buy or sell a security at a specified price or better.", answer: "limit", difficulty: "Medium", domain: "trading", bertCategory: "finance" },

  { text: "The [MASK] theorem states that a firm's value is unaffected by its capital structure in a perfect market.", answer: "Modigliani-Miller", difficulty: "Hard", domain: "corporate finance", bertCategory: "finance" },
  { text: "The [MASK] model extends CAPM by adding size and value factors to explain asset returns.", answer: "Fama-French", difficulty: "Hard", domain: "asset pricing", bertCategory: "finance" },
  { text: "A [MASK] obligation is a structured credit product that pools debt instruments and issues tranches.", answer: "collateralised debt", difficulty: "Hard", domain: "structured finance", bertCategory: "finance" },
  { text: "The [MASK] ratio measures a bank's core equity capital relative to its risk-weighted assets.", answer: "Tier 1 capital", difficulty: "Hard", domain: "banking regulation", bertCategory: "finance" },
  { text: "The [MASK] hypothesis asserts that asset prices fully reflect all available information.", answer: "efficient market", difficulty: "Hard", domain: "financial theory", bertCategory: "finance" },
  { text: "Value at [MASK] quantifies the maximum potential loss over a given time period at a specified confidence level.", answer: "Risk", difficulty: "Hard", domain: "risk management", bertCategory: "finance" },
  { text: "The [MASK] premium is the excess return that investing in stocks provides over a risk-free rate.", answer: "equity risk", difficulty: "Hard", domain: "asset pricing", bertCategory: "finance" },
  { text: "A [MASK] default swap transfers the credit risk of a reference entity from the protection buyer to the seller.", answer: "credit", difficulty: "Hard", domain: "derivatives", bertCategory: "finance" },
  { text: "The [MASK] ratio compares a company's enterprise value to its earnings before interest, taxes, depreciation, and amortisation.", answer: "EV/EBITDA", difficulty: "Hard", domain: "valuation", bertCategory: "finance" },
  { text: "The [MASK] effect describes the tendency for small-cap stocks to outperform large-cap stocks over time.", answer: "size", difficulty: "Hard", domain: "asset pricing", bertCategory: "finance" },

  // ════════════════════════════════════════════════════════════════
  //  LEGAL  (LegalBERT — EU/UK legislation & US court cases)
  // ════════════════════════════════════════════════════════════════
  { text: "A [MASK] is a legally binding agreement between two or more parties.", answer: "contract", difficulty: "Easy", domain: "contract law", bertCategory: "legal" },
  { text: "The [MASK] is the person accused of committing a crime.", answer: "defendant", difficulty: "Easy", domain: "criminal law", bertCategory: "legal" },
  { text: "A [MASK] is a formal written request submitted to a court.", answer: "petition", difficulty: "Easy", domain: "procedure", bertCategory: "legal" },
  { text: "The [MASK] is the decision made by a judge or jury at the end of a trial.", answer: "verdict", difficulty: "Easy", domain: "criminal law", bertCategory: "legal" },
  { text: "A [MASK] is a legal professional who represents clients in court.", answer: "lawyer", difficulty: "Easy", domain: "legal profession", bertCategory: "legal" },
  { text: "The [MASK] is the body of law that governs relationships between private individuals.", answer: "civil law", difficulty: "Easy", domain: "jurisprudence", bertCategory: "legal" },
  { text: "A [MASK] is a court order requiring a person to do or stop doing a specific act.", answer: "injunction", difficulty: "Easy", domain: "equity", bertCategory: "legal" },
  { text: "The [MASK] of limitations sets the maximum time after an event within which legal proceedings may be initiated.", answer: "statute", difficulty: "Easy", domain: "procedure", bertCategory: "legal" },
  { text: "A [MASK] is a document that gives one person authority to act on behalf of another.", answer: "power of attorney", difficulty: "Easy", domain: "property law", bertCategory: "legal" },
  { text: "The [MASK] is the legal principle that a person is innocent until proven guilty.", answer: "presumption of innocence", difficulty: "Easy", domain: "criminal law", bertCategory: "legal" },

  { text: "The [MASK] doctrine holds that courts should follow precedents set by earlier decisions.", answer: "stare decisis", difficulty: "Medium", domain: "jurisprudence", bertCategory: "legal" },
  { text: "A [MASK] is a written statement of facts confirmed by oath, used as evidence in court.", answer: "affidavit", difficulty: "Medium", domain: "procedure", bertCategory: "legal" },
  { text: "The [MASK] standard requires proof beyond a reasonable doubt in criminal proceedings.", answer: "burden of proof", difficulty: "Medium", domain: "criminal law", bertCategory: "legal" },
  { text: "A [MASK] clause in a contract limits one party's liability in the event of a breach.", answer: "limitation of liability", difficulty: "Medium", domain: "contract law", bertCategory: "legal" },
  { text: "The [MASK] privilege protects confidential communications between a client and their attorney.", answer: "attorney-client", difficulty: "Medium", domain: "evidence", bertCategory: "legal" },
  { text: "A [MASK] is a legal entity separate from its owners, capable of entering contracts and owning property.", answer: "corporation", difficulty: "Medium", domain: "corporate law", bertCategory: "legal" },
  { text: "The [MASK] Act 1998 incorporated the European Convention on Human Rights into UK law.", answer: "Human Rights", difficulty: "Medium", domain: "constitutional law", bertCategory: "legal" },
  { text: "A [MASK] is a court order requiring a person to appear before a judge.", answer: "subpoena", difficulty: "Medium", domain: "procedure", bertCategory: "legal" },
  { text: "The [MASK] is the legal principle that no one should be tried twice for the same offence.", answer: "double jeopardy", difficulty: "Medium", domain: "criminal law", bertCategory: "legal" },
  { text: "A [MASK] agreement is a contract in which an employee agrees not to compete with their employer after leaving.", answer: "non-compete", difficulty: "Medium", domain: "employment law", bertCategory: "legal" },

  { text: "The [MASK] doctrine prevents a party from asserting a position inconsistent with one previously taken.", answer: "estoppel", difficulty: "Hard", domain: "equity", bertCategory: "legal" },
  { text: "The [MASK] test in negligence determines whether a duty of care exists between parties.", answer: "Caparo", difficulty: "Hard", domain: "tort law", bertCategory: "legal" },
  { text: "The [MASK] principle in EU law requires that decisions be taken at the most local level possible.", answer: "subsidiarity", difficulty: "Hard", domain: "EU law", bertCategory: "legal" },
  { text: "A [MASK] trust arises by operation of law to prevent unjust enrichment.", answer: "constructive", difficulty: "Hard", domain: "equity", bertCategory: "legal" },
  { text: "The [MASK] rule excludes evidence obtained in violation of a defendant's constitutional rights.", answer: "exclusionary", difficulty: "Hard", domain: "criminal procedure", bertCategory: "legal" },
  { text: "The [MASK] doctrine holds that courts will not review the internal decisions of foreign sovereigns.", answer: "act of state", difficulty: "Hard", domain: "international law", bertCategory: "legal" },
  { text: "The [MASK] test determines whether a contractual term is incorporated by reference to a previous course of dealing.", answer: "reasonableness", difficulty: "Hard", domain: "contract law", bertCategory: "legal" },
  { text: "The [MASK] Convention governs the international sale of goods and has been adopted by over 90 states.", answer: "Vienna", difficulty: "Hard", domain: "international trade law", bertCategory: "legal" },
  { text: "A [MASK] injunction is granted without notice to the other party to preserve assets pending litigation.", answer: "freezing", difficulty: "Hard", domain: "equity", bertCategory: "legal" },
  { text: "The [MASK] principle requires that administrative decisions be proportionate to the objective pursued.", answer: "proportionality", difficulty: "Hard", domain: "administrative law", bertCategory: "legal" },
];

async function seed() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  // Clear existing sentences
  await connection.execute("DELETE FROM sentences");

  // Insert all sentences
  for (const s of sentences) {
    await connection.execute(
      "INSERT INTO sentences (text, answer, difficulty, domain, bertCategory) VALUES (?, ?, ?, ?, ?)",
      [s.text, s.answer, s.difficulty, s.domain, s.bertCategory]
    );
  }

  const byCategory = {};
  for (const s of sentences) {
    byCategory[s.bertCategory] = (byCategory[s.bertCategory] || 0) + 1;
  }

  console.log(`✅ Seeded ${sentences.length} sentences.`);
  console.log("  Breakdown by bertCategory:");
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`    ${cat.padEnd(10)} ${count} sentences`);
  }
  await connection.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
