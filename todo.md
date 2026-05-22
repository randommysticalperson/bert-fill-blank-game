# BERT Fill Blank Game — TODO

## Phase 1: Database & Seed
- [x] Update drizzle/schema.ts with sentences, game_sessions, session_answers tables
- [x] Run migration and apply SQL
- [x] Seed sentence bank (Easy/Medium/Hard sentences with [MASK])

## Phase 2: Backend Procedures
- [x] LLM fill-mask inference procedure (returns top N predictions for a [MASK] sentence)
- [x] Get sentences by difficulty procedure
- [x] Submit answer procedure (compare against LLM predictions, score logic)
- [x] Hint procedure (reveal one prediction, flag as hinted)
- [x] Session management (start, get state, end)

## Phase 3: Frontend Game UI
- [x] Global theme: dark, elegant, premium aesthetic
- [x] Home/landing page with difficulty selector (Easy, Medium, Hard)
- [x] Game loop page: sentence display with visible blank, input field, Submit button
- [x] Hint button labeled "Hint" with point-reduction warning
- [x] Answer feedback: correct/incorrect with clear visual feedback
- [x] Score display: running correct/total during play
- [x] Round progression: auto-advance after answer
- [x] Game Over summary screen with final score and replay option

## Phase 4: Polish
- [x] Refined typography (Google Fonts)
- [x] Generous whitespace and layout polish
- [x] Smooth transitions and micro-animations
- [x] Responsive design (mobile + desktop)
- [x] Loading states and skeleton screens

## Phase 5: Tests & Delivery
- [x] Vitest tests for backend procedures
- [x] Final checkpoint and delivery

## Sidecar (Option A — Local ONNX BERT)
- [x] Install Python deps: transformers, optimum[onnxruntime], onnxruntime, fastapi, uvicorn
- [x] Write bert_sidecar/export_model.py — download + ONNX export + INT8 quantize
- [x] Write bert_sidecar/server.py — FastAPI /predict endpoint, model-selector, multi-model cache
- [x] Update server/routers/game.ts — try sidecar first, fall back to LLM
- [x] Write bert_sidecar/README.md — full local setup guide
- [x] Smoke-test sidecar end-to-end in sandbox

## Bug Fix: Questions not matching BERT model categories
- [x] Add bertCategory column to sentences table (maps to BERT model keys)
- [x] Re-seed sentences with domain-appropriate content per BERT category
- [x] Update getSentencesByDifficulty to filter by bertCategory
- [x] Update startSession to pass bertModel as category filter
- [x] Update tests to cover category filtering

## New Feature: Multi-Mask Game Modes
- [x] Add gameMode column to sentences table (single / consecutive / parallel)
- [x] Add masks JSON column to sentences for multi-mask answers
- [x] Run migration and apply SQL
- [x] Seed multi-mask sentences (consecutive + parallel) for all 6 BERT categories × 3 difficulties
- [x] Backend: getPredictionsForMask procedure (single mask from multi-mask sentence)
- [x] Backend: submitConsecutiveAnswer procedure (one mask at a time, tracks position)
- [x] Backend: submitParallelAnswers procedure (all masks submitted together)
- [x] Backend: getSessionState returns gameMode so frontend knows which UI to show
- [x] Home screen: add Game Mode selector (Classic / Consecutive / Parallel) with descriptions
- [x] ConsecutiveMask game page: show sentence with current blank highlighted, fill one at a time
- [x] ParallelMask game page: show sentence with all blanks, independent input per blank
- [x] Partial scoring for parallel mode (points per correct blank)
- [x] Progress indicator per mask in consecutive mode (e.g. "Blank 2 of 3")
- [x] Vitest tests for multi-mask scoring and answer evaluation

## Fix: Consecutive mode — fill multiple blanks within the same sentence
- [x] Backend: track currentMaskIndex per sentence in session state; only advance sentence when all masks answered
- [x] Backend: submitAnswer returns nextMaskIndex + whether sentence is complete
- [x] Frontend: stay on same sentence after each mask answer; show revealed answers inline in sentence
- [x] Frontend: progress bar shows "Blank X of Y" within the current sentence
- [x] Frontend: only move to next sentence when all masks in current sentence are done
- [x] Tests: update consecutive scoring tests to reflect within-sentence progression

## Feature: Word-count blank placeholders (_ vs _ _)
- [x] Read schema and Game.tsx sentence renderer
- [x] Derive word count from answer at render time (no schema change needed)
- [x] Render [MASK] as _ _ _ (one underscore per word) in the sentence display
- [x] Update all three modes (classic, consecutive, parallel)
- [x] Test and checkpoint

## Rewrite: Consecutive mode — context-aware N-blank prediction
- [x] Backend: submitAnswer for consecutive builds a context sentence where prior blanks are filled with player's answers, then predicts the current [MASK] using that context
- [x] Backend: getHint for consecutive also uses context-aware sentence
- [x] Frontend: show all N blanks in the sentence at once; active blank is highlighted, prior blanks show player's answers (correct/incorrect coloured), future blanks show word-count placeholders
- [x] Frontend: after each blank, stay on same sentence, update context, move to next blank
- [x] Frontend: full feedback panel only after last blank — shows all N answers in a summary row
- [x] Tests: update consecutive tests for context-aware prediction

## Full Rewrite: Consecutive Mode (from scratch)
- [x] Remove all consecutive-specific state, handlers, and render helpers from Game.tsx
- [x] Remove consecutive branching from submitAnswer and getHint call sites in Game.tsx
- [x] Write new ConsecutiveGame.tsx component (self-contained, clean)
- [x] Backend: dedicated submitConsecutiveAnswer procedure (replaces overloaded submitAnswer)
- [x] Backend: dedicated getConsecutiveHint procedure
- [x] ConsecutiveGame UI: sentence with all N blanks visible, active blank pulsing, prior answers shown inline
- [x] ConsecutiveGame: step-by-step input (one at a time), BERT context chain per step
- [x] ConsecutiveGame: per-sentence summary panel after last blank
- [x] ConsecutiveGame: score/progress bar at top
- [x] Wire ConsecutiveGame into Game.tsx routing
- [x] Update tests for new consecutive procedures
- [x] Checkpoint and deliver
