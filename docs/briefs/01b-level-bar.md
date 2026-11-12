# Brief 01b: the bottom bar is a level bar

Small fix to brief 01. Read the updated `CLAUDE.md` and `docs/PRODUCT.md` first.

## Change

- The bottom-left bar is a **level bar**, not a daily cap bar. It shows progress from the current room level to the next one.
- Level comes from **lifetime earned cubes**: the sum of positive `ssx_ledger.delta` rows for the player. Spending cubes never lowers the level. Thresholds are in `config/cubes.json` under `levels`.
- Show the level number next to the bar in Space Mono, lowercase: `lv 3`.
- When a receipt pushes the player past a threshold, add a final receipt line `level up: lv 4` with a slightly different chime.
- The **daily cap stays**, but invisible: it is a cost and anti-farming guard. When it is reached, receipts show `daily cap reached` and award 0, as now. Remove it from the bar.
- Mission rewards keep counting toward the daily cap (current behavior, keep it).

## Where

- Compute level and progress in one shared helper used by the home screen and the dump API response.
- The dump API response adds `level`, `level_progress` (0 to 1) and `leveled_up` (boolean).

## Acceptance checks

- [ ] The bar shows progress to the next level, and `lv N` matches the thresholds.
- [ ] Spending cubes (simulate with a negative ledger row in a test) does not lower the level.
- [ ] Crossing a threshold shows `level up` on the receipt.
- [ ] Hitting the daily cap no longer changes the bar.
- [ ] Log results in `docs/LOG.md`.
