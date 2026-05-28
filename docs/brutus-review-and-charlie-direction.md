# Brutus Review & Charlie Direction

_Living document for architecture reflection. Written after the mineable-now push (May 2026). Use this for a deep thinking exercise: are we going in the right direction?_

---

## Context: what Brutus is

Brutus = Atticus brain + deterministic drives + body affordances (craft/mine hints) + run logging + parallel thalamus/drives.

Agent line: Atticus → Brutus → Charlie… Agents never merge backward. Each letter owns `src/agents/<name>/`.

---

## Run review: mineable-now session

**Run:** `src/agents/brutus/data/runs/2026-05-28T16-58-11-642Z/`  
**Session slice:** ticks 86–129 (~5 min, ~$0.07, 89 LLM calls)

### Headline results

| Metric | Result |
|--------|--------|
| Mine attempts | 40 |
| Mine failures | **0** (prior run had 4× "cannot dig") |
| Mineable list | 15 blocks every tick |
| Coal | **Reached** — t107–111 mined coal_ore at y=56→54; 5× coal in inventory |
| Iron | Passed — exposed veins nearby, never mined |
| Equip (this session) | 0 — pickaxe already held from prior WM (`held_item: wooden_pickaxe`) |
| Drives peak | futility 0.93, boredom 1.00 |

### Timeline (this boot slice)

- **t86** — one `move`, then mining starts
- **t87–106** — dirt/grass/stone, y=63→61, horizontal then down
- **t107–111** — coal_ore successfully
- **t112–129** — continued underfoot/adjacent stone mining; mining spree, no egress plan

### Did Mineable now present properly?

**Yes, functionally.** All mine coords came from the affordance list; zero execute failures. The agent went from "hammer unreachable buried ore" to "40 successful digs including coal."

Caveats:

- **Slow start** in the full agent lifetime was mostly pre-t86 (walking, prior session WM) plus one move at t86 before the dig loop locked in.
- **Unstable mineable IDs** — `mineable:151` vs `mineable:105` for the same block across ticks (index-based assignment). Thalamus refs like `mineable:194` can fail hydration when IDs reshuffle between ticks.
- **Thalamus still surfaces ore scene objects** for "context" while PFC should mine from body.mineable — works mostly, but adds noise.

### Pickaxe / viewer

Pickaxe was equipped (percept `held_item`) but **no equip action** in this run slice — carried over from WM. If the viewer doesn't show the tool, that's likely rendering, not brain.

### "Mining below other blocks"

Valid Minecraft mechanics, confusing agent semantics:

- **Underfoot** (y=51 while standing at y=52) = break floor, fall — correct for digging down.
- Agent also mines **same-level adjacent** blocks, widening a pit without stairs.
- Relation labels don't convey "you will fall" or "no way back up."
- STATUS eventually shows **"standing on air"** — percept knows something is off, nothing explains why or what to do.

### Smaller bugs observed

1. **Mineable IDs** should be coord-based (`mineable:88:51:-100`), not scan index.
2. **`depth_below_feet=-3`** on coal reads like "below" but means **above** (sign inverted) — confuses the model.
3. **X-ray ore catalog** — 18 ore veins in thalamus prompt (~5k tokens/tick), most `exposed=false` — planning noise, not perception.
4. **No egress** — 15× dirt + 15× cobble in inventory, never `place` to climb out.

---

## Problems to address

### Quick Brutus patches (optional on Charlie branch)

1. Stable mineable IDs from coordinates
2. Fix depth sign → `depth_above_feet` / `depth_below_feet` with clear semantics
3. Body **situation** hint (deterministic): `{ in_hole, surface_y, blocks_to_surface, placeable_count }`
4. Filter scene ores — only veins with a block in Mineable now, or cap nearest 2–3
5. Stronger futility when same-y underfoot mine streak without goal progress

### Charlie-scale

6. **Egress awareness** — spatial/body: mining underfoot without a climb plan should surface as a felt problem
7. **Episodic memory** — runs → queryable episodes ("dug straight down at 88,-100, got coal, stuck")
8. **Strip prompt framing** — affordances from body, not 30 lines of thalamus rules

---

## What worked in this push (keep)

- **Run logger** — `ticks.jsonl`, `llm.jsonl`, `summary.json` with drives aggregates
- **Action outcomes in WM** — PFC sees `FAILED` / `ok: mined stone`; pivot after failures worked in prior run
- **Craftable now** — body recipes, no pretrained craft knowledge
- **Mineable now** — body `canDigBlock` filter; zero mine failures this run
- **Scene reachability meta** — `exposed`, `depth_below_feet`, `mineable_at` on ore/tree clusters
- **Parallel thalamus + drives base** — drives are CPU (deterministic), not LLM; parallel saves little wall-clock but architecture is clean
- **Focus hydration for `body.mineable`** — thalamus can point PFC at exact dig targets

---

## Instincts vs learning — what Brutus actually is

Brutus today is **heavily framed instincts pretending to be a mind**:

```
Body (deterministic affordances)  →  "here's what you CAN do"
Thalamus (LLM + many rules)       →  "here's what you SHOULD notice"
Drives (deterministic math)       →  "here's how you SHOULD feel"
PFC (LLM)                         →  "here's what you SHOULD do"
```

That produces a **competent test harness**, not an agent that learns its environment. Mineable worked because we **removed a failure mode**, not because Brutus understood mining.

### Mapping to biology / engineering

| Layer | Brutus (instinct / body) | Charlie (learning / mind) |
|-------|--------------------------|---------------------------|
| **Reflexes** | `canDigBlock`, recipes, pathfind | Same — env-specific, never LLM |
| **Affordances** | Craftable / Mineable now | Unified `describeAffordances()` |
| **Perception** | Scene + heightmap (x-ray ore cheat) | Honest FOV + optional semantic clusters |
| **Attention** | Thalamus picks refs from full dump | Thalamus picks from percept + **memory retrieval** |
| **Motivation** | Formula drives | LLM limbic *or* learned value from outcomes |
| **Deliberation** | PFC one-shot JSON | PFC + **recall** ("last time I dug straight down I got stuck") |
| **Memory** | 50-event WM ring | Episodic log + spatial places + skill notes |

**Instincts** = body + low-level reflexes (cheap, deterministic, correct).  
**Learning** = updating what matters based on outcomes over time (memory, not bigger prompts).

### Drives as LLM (deferred)

User expectation: limbic system should be an LLM like thalamus/PFC — pattern recognition over body state + experience → felt qualia.

Brutus uses arithmetic (`futility = failures/3`, etc.) for cost, testability, and speed. Parallel `Promise.all([attention(), computeDrivesBase()])` works; drives show "no LLM cost" because they were never LLM.

Charlie candidate: third parallel LLM call for drives, or drives LLM sequential after a memory retrieval step. Keep deterministic drives as test baseline.

---

## The framing problem

Easy fix: write functions that serve exactly the right context → better agent short-term.

**That is not the long-term goal.** Goal: system placed in any environment, learns to navigate and grow — dumb at start, like infant vs instinct.

Current prompt stack per tick:

- Full heightmap (16×16)
- 18 x-ray ore veins with metadata
- Mineable now (15 lines)
- Craftable now
- 10 recent events including verbose PFC thoughts
- Thalamus rule essay (~40 lines)
- PFC task rules
- Drives felt lines

**~5k+ tokens thalamus, ~2k PFC** — mostly re-feeding the same narrative. Cost isn't the primary concern; **capability ceiling** is. More rules ≠ more understanding.

### What framing should be vs shouldn't

| OK (perception / body) | Not OK (cheating cognition) |
|------------------------|----------------------------|
| Mineable now from `canDigBlock` | "Only mine these coords" repeated in 4 places |
| Craftable from recipes | Listing every recipe in static action docs |
| Situation: "you are 13 blocks below surface" | "You should place cobble to get out" |
| Honest FOV | X-ray ore radar for thalamus to stare at |

Affordances = **what the body can do right now** (like proprioception + affordance perception).  
Rules = **telling the model the answer** (doesn't transfer, doesn't learn).

---

## What to simplify for Charlie

**Remove or shrink:**

- Thalamus rule essay → ~3 lines: emit refs, match verbs to affordances, brief is neutral
- Duplicate Craftable/Mineable in thalamus AND PFC → PFC gets hydrated focus + affordances only if not already in focus
- Full thought re-feed every tick → episodic summaries ("recent: dug down 15 blocks, found coal, still descending")
- 18 x-ray ore veins → 0–3 actionable + rest from memory if seen before
- `actions_in_play` verb filtering → optional; affordances already constrain mine targets
- Intention-streak narrative loops in WM (thought → intention → thought)

**Keep:**

- Body affordance lists — perception, not cheating
- Action outcomes in WM — learning signal
- Run logger — training / debug data
- Focus ref → hydrate pattern — good compression if percept is honest

---

## What to add for Charlie

### 1. Hippocampus (episodic memory)

- Append-only episodes: `{ place, intention, action, outcome, felt, tick }`
- Stored under `src/agents/charlie/data/episodes/` (or sqlite later)
- Thalamus/PFC retrieve top-k relevant episodes — not last 10 verbatim thoughts
- Source: run logs already capture this; promote to queryable store

### 2. Spatial sketch (deterministic)

- Local map: `{ x,z → max_y_visited, min_y_visited, last_outcome }`
- Per tick body hints: `blocks_to_surface`, `in_hole`, `pillar_possible` (has placeable blocks + adjacent air)
- Enables egress without telling agent "place cobble now"

### 3. Honest perception

- Scene objects only for line-of-sight / reachable clusters
- Remove or demote x-ray `findBlocks` ore listing from thalamus input
- Ore "awareness" comes from memory ("I saw coal to the SW yesterday") or from mineable when exposed

### 4. LLM drives (optional)

- Parallel with thalamus
- Reads: self, recent outcomes, memory snippets, identity
- Emits: felt qualia strings, not numeric signals
- Brutus deterministic drives remain for tests/comparison

### 5. Outcome learning loop (minimal v1)

- After N identical successful mines with no goal progress → write episode "strategy X didn't help"
- Next tick memory retrieval surfaces it
- Learning without new prompt rules

### 6. Place affordance

- `Placeable now`: adjacent air faces where inventory blocks can go
- Unlocks egress, building, crafting table placement — same pattern as mine/craft hints

### 7. Unified affordances API

```typescript
describeAffordances(bot, ctx): {
  craftable, mineable, placeable,
  situation: { in_hole, depth, blocks_to_surface },
  crafting_table_nearby
}
```

One body call, one prompt block — less duplication.

---

## Charlie in one sentence

**Charlie = same body reflexes + honest perception + episodic/spatial memory + thinner prompts + (optional) LLM drives — learning from outcomes instead of pre-writing every edge case in thalamus rules.**

---

## Open questions for deep thinking

Use these when stepping away from implementation:

1. **Are affordance lists instincts or cheats?** They mirror human proprioception ("I can reach that"). Is that the right boundary?

2. **Should thalamus exist at all in Charlie?** Or does memory retrieval + raw percept replace attention filtering?

3. **What is the minimum memory for "learning"?** Episodes only? Spatial map? Both?

4. **When does the agent get dumber on purpose?** Remove mineable hints and let it fail until memory builds — or always keep body affordances as reflex?

5. **Transfer test:** If Charlie works in Minecraft, what body contract transfers to a non-voxel env? (`describeAffordances` + `sense` + `execute` + outcomes)

6. **Drives: LLM vs learned vs deterministic?** Three-way tradeoff: cost, personality, reproducibility.

7. **Is the alphabet agent line the right isolation?** Brutus frozen, Charlie experiments — or fork within Charlie for A/B?

8. **What's the success criterion for Charlie v1?** Not "mines coal" (Brutus does that). Maybe: "digs down, gets stuck, remembers, places blocks to escape without prompt rule telling it to."

---

## Architecture diagram (current vs target)

### Brutus (now)

```
sense → body hints (craft/mine)
     → [ Thalamus LLM | drives CPU ]
     → hydrate focus
     → finalize drives
     → PFC LLM
     → act → action_outcome → WM (50 events)
     → run log
```

### Charlie (target sketch)

```
sense → body affordances (craft/mine/place/situation)
     → [ Thalamus LLM | drives LLM? ]  (parallel)
     → memory retrieve (episodes + spatial)
     → hydrate focus
     → PFC LLM
     → act → outcome → WM + episode store + spatial update
     → run log
```

---

## Related files

| Path | Role |
|------|------|
| `NOTES.md` | Original hypothesis & parking lot |
| `src/body/minecraft/mine-hints.ts` | Mineable now |
| `src/body/minecraft/craft-hints.ts` | Craftable now |
| `src/body/minecraft/reachability.ts` | Scene cluster exposed/depth meta |
| `src/brain/drives.ts` | Deterministic limbic |
| `src/brain/attention.ts` | Thalamus prompts |
| `src/brain/executive.ts` | PFC prompts |
| `src/agents/run-log.ts` | Run persistence |
| `src/agents/brutus/data/runs/` | Run artifacts |

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-28 | Initial doc after mineable push + 5min Brutus run analysis |
