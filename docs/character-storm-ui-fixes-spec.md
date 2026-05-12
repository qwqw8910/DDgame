# Spec: Character Storm UI and Round Flow Fixes

## Objective
Improve the Character Storm game experience by fixing readability, timing fairness, input behavior, round stability, and non-repeating topics in a single game session.

Success means:
- Text is readable with a minimum visual size baseline of 16px in Character Storm screens.
- Font style is unified, including the top-left system title.
- Hint and guess phases both use 90-second timers.
- Round 2 countdown is consistently visible and synchronized.
- Browser input memory/autofill does not keep prior values unexpectedly.
- Topics do not repeat within the same game session.
- Round transition animation does not double-trigger, and guessers do not briefly see hidden topics.

## Tech Stack
- Frontend: Vue 3 + Vite (`vue-app`)
- Backend: Node.js + Socket.IO (`server/character-storm`)

## Commands
- Dev all: `npm run dev`
- Dev server only: `npm run dev:server`
- Dev web only: `npm run dev:web`

## Project Structure
- `server/character-storm/index.js`: timer, round flow, topic draw, game lifecycle
- `vue-app/src/apps/character-storm/composables/useCharacterStorm.js`: socket state and client timer state
- `vue-app/src/apps/character-storm/pages/CharacterStormRoomPage.vue`: UI behavior, phase transition animation, input fields
- `vue-app/src/assets/style.css`: global and shared typography styles

## Code Style
Use existing Composition API style and incremental edits.

```js
// Keep server and client timer constants aligned for predictable UX.
const TIMER_SECONDS = 90
```

## Testing Strategy
- Manual real-time check with two browser tabs:
  - Round 1 and Round 2 timers count from 90 and update each second.
  - Guesser cannot see topic during round transition from wrong round1 guess to round2.
  - Phase animation appears only on major transitions (round starts / reveal / finish).
  - Input boxes do not show browser autofill memory.
  - Topic does not repeat within one game session.

## Boundaries
- Always: Keep socket event contract backward-compatible where possible; keep edits minimal and targeted.
- Ask first: DB schema changes, adding dependencies, protocol-breaking event renames.
- Never: Expose hidden topic to guesser in active guess phases.

## Success Criteria
- [ ] Min font size baseline is 16px on Character Storm page text controls.
- [ ] Header title font is consistent with system font stack.
- [ ] Both hint and guess timers are 90 seconds.
- [ ] Round 2 countdown remains visible.
- [ ] Inputs disable browser autocomplete/autocorrect memory behavior.
- [ ] No topic repeat in a single game session.
- [ ] No duplicate transition flash/audio cascade at round changes.
- [ ] No transient topic leak to guesser between rounds.

## Open Questions
- If the topic pool is exhausted within a session, current fix ends the game instead of allowing repeats. This enforces non-repeat strictly.
