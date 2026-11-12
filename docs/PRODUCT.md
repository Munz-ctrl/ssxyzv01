# Sunsex v0: product spec

Condensed from the living Build Bible: https://claude.ai/artifact/Mf7Y1XERjsNNYyEQkh7FL9 (that doc wins if they differ).

## The idea

Sunsex lifts the player out of first person and shows their life from the observer's seat: the -33 degree isometric camera. v0 is **Inner World**: dump anything into the `[ + ]`, and your home fills with what you think and do. The player talks to themselves; there is no chatbot on the front page.

## The loop

1. Make your avatar from a selfie (one free try), then sign up to keep it. *(later brief)*
2. Home: your avatar on an empty floor, the `[ + ]`, the HUD.
3. Dump: type, speak or add a photo.
4. The sorter agent splits the input into parts and labels each part.
5. The player gets a **receipt**, with a short chime per line.
6. Boxes land in the room; unpacking and placing a box is the approval. *(later brief)*
7. The thought manager writes next steps daily and a weekly "what I noticed" card.

## The sorter: part types

| Label | Example | Cubes | Confirm |
| --- | --- | --- | --- |
| `dump` (thought, feeling, plan, update, memory) | "been sleeping better since I quit late coffee" | Earns | No |
| `space_edit` (change the room, library option exists) | "make the walls black" | Free or a few | One tap |
| `wishlist` (space edit with no library object yet) | "add a waterfall" | 0, saved to wishlist | No |
| `avatar_change` | "my outfit to this pic" | Spends (paid generation) | Always, shows price |
| `sequel_image` (something the avatar does) | "a car crashes into him" | Spends | Always, shows price |
| `spam` | "asdf asdf" | 0, dull thud and `...` | No |

- Mixed inputs are split into several parts on one receipt.
- Wish or command unclear: show two chips, *make it happen* / *just a thought*.
- Commands never earn cubes.

## Receipt format

```
[ receipt ]
+12 cubes
+1 box: <object>            (later brief)
+1 mission: <title>
+1 insight added to vault
+2 suggestions attached
+1 note                     (heavy dumps only)
```
Commands use `[ command ]` with each action and its price. Spam shows only `...`.

## Heavy dumps

The agent flags heavy, personal dumps (fear, grief, loneliness, shame, a hard loop). Same receipt plus `+1 note`. The note is 2 to 3 short lines: it reflects the player's own words, gives one concrete next step that points toward real life or real people, never claims feelings, never diagnoses or lectures. If a dump suggests risk of self-harm, drop the game: answer seriously and show crisis resources.

## Thought manager

Quotes the original dump whenever it links two thoughts. Only calls something a pattern after three mentions; passing thoughts stay passing.

## How a dump is valued

The AI labels signals; code converts them to cubes using `config/cubes.json`.

| Signal | Rewards |
| --- | --- |
| Real input | Small base reward, even "tired today" |
| New | Bonus when it tells the agent something it did not know |
| Specific | Bonus for who, where, why, what next |
| Reflective | Bonus for a reason or a decision |
| Plan | Bonus when it creates or updates a mission |
| Follow-through | Biggest reward: mission done (more with a photo, later) |
| First dump of the day | Bonus |

Never rewarded: length, emotional intensity, repeating known things.

**Anti-farming:** cheap pre-check before any paid call (gibberish, too short, duplicates, rapid-fire); diminishing returns per dump each day; an invisible daily cap (cost guard, never shown as a bar); close repeats earn only the base; pasted walls of text earn like a normal dump; cubes are not transferable.

## Visual rules

| Rule | Spec |
| --- | --- |
| Camera | -33 deg tilt, 45 deg rotation, flat long lens (C4D preset SSX_CAM_v1) |
| Floor lines | 28.4 deg from horizontal on screen |
| Scale | 1 tile = 1 m. Base home = empty floor, no walls. Grid hidden except while placing |
| Portrait 1080 x 1920 | tile edge 165 px, diamond 290 px wide, 1.8 m person about 310 px |
| Landscape 1920 x 1080 | tile edge 93 px, diamond 164 px wide, person about 175 px (0.56 x portrait) |
| Avatar files | 800 x 1000 px transparent PNG at 2x portrait, person 620 px tall, feet anchor (400, 900), shadow included, sticker edge drawn by the app |
| Real vs imagined | Real (camera capture): sticker cutout, counts more. Imagined (typed or library): clean, slightly ghosted |
| Font | Space Mono (alternate: Ubuntu Mono) |
| HUD | Top left: `sunsex isometric v0.01` / `coord. [x, y]` / `memory: <handle>-<n>`. `[ + ]` low center. Level bar bottom left (progress to next room level, from lifetime earned cubes; spending never lowers it), cube count bottom right (wallet) |

**Layouts:** portrait = zoomed crop, player upper middle, `[ + ]` low and centered. Landscape = full scene, player on the left, expanded UI on the right (open input, mission cards, cube count).

## Not in v0

Memory scene branches, file uploads beyond photos, map and missions outside (Outer World), multiplayer, walkable world, extra mini games, payments (Chapter 6).
