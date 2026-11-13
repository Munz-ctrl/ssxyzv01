# Brief 02a: sounds, vault cleanup, prompt box nudges

Read `docs/AGENT.md` first (new). Small brief: no new tables, no agent prompt changes.

## 1. Sound effects
Use the Web Audio API, synthesized in code (no audio files needed). Put it in `src/lib/sfx.ts` with one exported function per sound.
- `tap()`: a very short, soft tick on every button press, under 30 ms, quiet.
- `cube(i)`: a short bright chime per cube line on the receipt. Pitch rises with `i` (one step up per cube), so a big receipt climbs.
- `fill()`: a soft rising whoosh while the level bar fills.
- `levelUp()`: a short two or three note sting when the level goes up.
- Mute toggle at the bottom of the vault: `sound: on / off`, saved in localStorage (wrapped in try/catch). Default on.
- Create the AudioContext on the first tap (iOS requires a user gesture).
- Keep everything minimal and quick. If a sound feels long, cut it.

## 2. Vault cleanup
The vault only holds things worth coming back to.
- **Insights move to history.** Remove the `insights` section from `Vault.tsx`. In `History.tsx`, under each dump, show its insight line(s): vault items with `kind = 'insight'` whose `source_dump_ids` contains that dump's id. Small and gray, under the receipt.
- **Patterns are hidden for now.** Keep writing them to the database (background knowledge), but do not show the `patterns` section in the vault and drop the patterns count from the receipt. A later brief brings them back once the agent can say them with value.
- Vault order: missions, notes, then the rest.

## 3. Prompt box nudges
Replace the static placeholder in `Home.tsx` with a rotating set of short filler questions that fade in and out (about 4 s each, a 400 ms fade). Stop rotating while the box has focus or text.
- Starting set, in `config/nudges.json` (lowercase, no em dashes):
  `wya?`, `how you feel?`, `what did you do today?`, `what's on your mind?`, `who did you see?`, `what are you avoiding?`, `what made you smile?`, `what's next?`
- Shuffle on load. A later brief lets the agent customize this list per player.

## Done when
- Every button ticks; receipts chime upward per cube; the bar fill and a level up have sounds; mute works and persists.
- Vault shows no insights or patterns sections; history shows insights under their dumps.
- The empty prompt box cycles nudges and stops when typing.
- `npm run build` passes. Log it in `docs/LOG.md`.
