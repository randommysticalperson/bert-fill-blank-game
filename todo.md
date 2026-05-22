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
