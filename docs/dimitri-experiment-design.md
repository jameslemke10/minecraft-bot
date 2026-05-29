# Dimitri Experiment Design

_Living document. Created 2026-05-29 from a strategy + flow-mapping session. This is the "what are we actually building and measuring, and how does the context flow" companion to [vision-and-direction.md](vision-and-direction.md) (the why) and [brutus-review-and-charlie-direction.md](brutus-review-and-charlie-direction.md) (prior reflection)._

---

## The pivot (2026-05-29)

We are **dropping the "make it alive / AI entity" framing.** It proved unfalsifiable and unsteerable — you cannot quantify "aliveness" or trend toward it, and most of what we were building toward it was noise. The vision doc already foreshadowed this: *"'alive' is the story; 'adapts' is the falsifiable claim — do not conflate them."* We now keep only the measurable bet.

**Charlie is skipped.** The elaborate honest-FOV / spatial-perception rework it specified is exactly the spatial investment the vision doc says not to make (spatial doesn't transfer between bodies). We keep the cheap, transferable Charlie ideas (bounded memory, thinner prompts) and fold them into **Dimitri** (agent D in the alphabet line: Atticus → Brutus → ~~Charlie~~ → **Dimitri**).

---

## The hypothesis under test

> **Continuous context management** — a cheap, fast model curates a bounded, continuously-updated working set that is handed to a larger model as a single fresh user message each step — is **more cost- and time-effective, at equal or better task progress**, than **context accumulation + compaction** — a single agentic loop that appends every observation to a growing transcript and periodically summarizes/evicts when it nears the context limit.

This is **H1** from the vision doc ("coherence comes from context routing, not model size"), sharpened into a runnable A/B. It is **not** the generality claim (H2) — the goal here is fixed and identical across both arms, so a win proves the *mechanism*, not generality. Do not oversell it.

The result is **not** a foregone conclusion. Continuous curation pays a per-step cost; compaction amortizes one big summarization over many cheap appends. The experiment exists to find out which wins, not to confirm a hunch.

---

## The two arms

Both arms: same reasoning model, same body, same world seed, same action set, **same perception** (see "Shared perception" below), same goal, same tick cap. The only thing that differs is how the in-context working set is maintained.

### Arm A — Dimitri (continuous context management)

The architecture **already exists** in Brutus's loop. [gemini.ts:105](../src/llm/gemini.ts#L105) calls `generateContent({ contents: user, config: { systemInstruction: system }})` — a single user string, no message array. Every tick rebuilds one fresh prompt and gets JSON back.

```
persistent state {goal, working memory}  ← lives across ticks, on disk
per tick:
  sense → percept
  CHEAP model (curator): percept + state → (a) rewrites bounded working memory
                                           (b) selects what the big model sees
  hydrate (deterministic): resolve selections to full data
  BIG model (reasoner): ONE user message (goal + curated WM + selection) → {thought, action}
  act → outcome folded back into state
cost/tick ≈ cheap-curate + big-decide, BOTH bounded → ~flat over horizon
```

Maps to today's modules: cheap = Thalamus ([attention.ts](../src/brain/attention.ts)), big = PFC ([executive.ts](../src/brain/executive.ts)), state = Workspace ([workspace.ts](../src/brain/workspace.ts)).

### Arm B — baseline (accumulation + compaction) — to build

```
messages = [ system(identity + goal + tool docs), user(initial percept) ]
per tick:
  assistant = BIG_MODEL(messages)          // same model as Dimitri's reasoner
  append assistant (thought + tool_call)
  result = execute(tool_call)              // same body.execute
  append tool result + auto-appended new percept
  if promptTokens > BUDGET:                // fixed budget forces compaction in-run
     summary = BIG_MODEL(summarize messages[0..n])   // must preserve the shared WM contract
     messages = [ system, user(summary), ...recentK ]
cost/tick grows with transcript until compaction, then sawtooths → higher avg
```

Design decisions:
- **No separate per-tick state update.** The transcript *is* the state; it only reorganizes at compaction. (This is the core contrast with Dimitri.)
- **Tool calls, not RAG.** Representative modern agent = function-calling over the action verbs. RAG/long-term retrieval is deferred (see "Memory").
- **Observation policy:** *auto-observe* (harness appends the new percept after every action) for v1 — keeps "one tick = one action" identical to Dimitri for a clean A/B. *Pull-observe* (model calls `look()` when it wants state — "how agent loops mostly work now") is a realistic later variant.
- **Same big model does reasoning AND summarization** — the honest "what you'd do without the curation trick." Letting a cheap model summarize would *be* Dimitri.
- **Fixed context budget** (e.g. 32k) so compaction actually fires within one diamond run and stays affordable; Flash's true 1M window would only compact after hundreds of ticks.

---

## Byte-by-byte context map (current Brutus loop = Arm A foundation)

| Stage | What happens | Source | ~tokens |
|---|---|---|---|
| 0 | Server → mineflayer live world model | packets | — |
| 1 | Sensors → `RawPercept` ([sensors/index.ts](../src/agents/brutus/body/minecraft/sensors/index.ts)) | `bot.*`, `blockAt`, `findBlocks` | — |
| 1a | `senseSelf` pos/vitals/inventory/motion | `bot.entity`, `bot.health/food/inventory` | ~80 |
| 1b | `senseTerrain` biome/time/weather/looking-at | registry, `bot.time`, `blockAtCursor` | ~40 |
| 1c | `senseScene` heightmap (16×16 ASCII) | `blockAt` × ~272 columns | **~1500** |
| 1d | `senseScene` objects (trees/water/**ores**/standalones/entities) | `findBlocks` (incl. buried ore = x-ray) | **~1000+** |
| 1e | `senseEntities` (≤16 within r=16) | `bot.entities` | ~200 |
| 1f | `new_events` (drained ring) | mineflayer events | varies |
| 2 | Percept folded into WM: self overwritten, events → **50-cap FIFO** ([workspace.ts:12](../src/brain/workspace.ts#L12)) | — | — |
| 3 | Body hints: craftable + mineable ([body-hints.ts](../src/body/minecraft/body-hints.ts)) | live recipes, reachability | — |
| 4 | **CHEAP curator LLM** ([attention.ts:108](../src/brain/attention.ts#L108)): full percept + heightmap + objects + events + hints + 10-verb menu + ~30 rule lines → `{focus_refs, actions_in_play, brief}` | flash-lite | **~5k in** |
| 5 | Hydrate refs → `FocusItem[]`; filter menu (no LLM) | — | — |
| 6 | **BIG reasoner LLM** ([executive.ts:152](../src/brain/executive.ts#L152)): self + intention + brief + hints (**dup**) + hydrated focus + events + menu → `{thought, intention, action}` | flash | **~2k in** |
| 7 | Act: execute, append action + outcome events; RunLog | — | — |
| 8 | loop (`tick++`) | — | — |

**Heaviest blocks:** the heightmap and the ore-vein catalog (x-ray — [scene.ts:265](../src/agents/brutus/body/minecraft/sensors/scene.ts#L265) returns buried ore). **The long-horizon hole:** the only "history" is a 50-event FIFO that *forgets*, it doesn't grow — so anything older than ~50 ticks is lost unless something curates it. That gap is the whole reason Dimitri needs a real curated working memory.

---

## Shared perception (deliberate, not auto-generated) — BUILT

**Decided + built (2026-05-29)** in `src/body/minecraft/general/`. Both arms consume this identical layer (a controlled constant). We probed the full mineflayer surface (`pnpm probe`) and chose a **bounded-x-ray** model: simple to build, and the bound (±8) still forces exploration because deep resources fall outside the cube.

Three insights settled it: (1) the game gives *state* (what is) + an *API* (callable methods) but **no "available actions" data** — the action vocabulary is authored, not sensed; (2) full omniscient `findBlocks` would collapse the long horizon the experiment needs, so we bound it; (3) raw cube dumps are a context bomb, so the *sensor* knows the cube but the *percept* is a compressed projection.

The `Percept` ([percept.ts](../src/body/minecraft/general/percept.ts)):
- **self** — full proprioception (pos, vitals, inventory, held, motion).
- **world** — biome / time / weather (honest global facts).
- **surroundings** — `standing_on` (block directly below, emphasized), `near` (radius-1 touching shell, every solid block by global coords — usually <15 since most cells are air), `notable` (out to ±8: ores/water/lava/containers — the resource/hazard radar). **No air** (open = absence), **no "bulk" counts**, decoration (grass/flowers) filtered, fluids kept as hazards.
- **entities** + **new_events** (world-level only; brain adds thoughts/actions).

A shared `renderPercept` ([render.ts](../src/body/minecraft/general/render.ts)) makes the per-tick observation text byte-identical across arms. Resource knowledge beyond ±8 must come from **memory** (seen earlier), not a query.

### Action vocabulary — BUILT
General, task-agnostic 13-verb set with usage docs ([actions.ts](../src/body/minecraft/general/actions.ts)): move, mine, place, craft, **smelt** (furnace interaction — new, required for the iron→diamond path), equip (hand+armor), eat, attack, **activate** (use blocks — new), **drop** (new), sleep, chat, wait. Validity is learned from **action-outcome feedback**, not pre-filtered (affordances deferred). Surfaced every tick: a JSON enum for Dimitri, a tool schema for the baseline.

### Task abstraction — BUILT
The only task-specific piece ([src/task/](../src/task/)): `Task = { goal, isComplete, progress }`. `diamondTask` implements the 0–11 ladder from inventory. Swap the Task to run a different experiment; body + brain stay general. (`Body` is now generic over its percept type — backward-compatible; Atticus/Brutus untouched.)

---

## Working-memory architecture (LOCKED 2026-05-29)

**Core reframe: percept = present, WM = beyond-now.** The percept is already bounded and fresh every tick (self, inventory, surroundings ±8, entities). So the WM holds *only what the percept can't currently show*: out-of-range locations, lessons from failures, where you've been, the plan. **Never store in WM what the percept already gives** (e.g. not "I have a stone pickaxe" — inventory says so each tick). This division is what keeps WM small.

**Two pure roles — context-management in one model, cognition+execution in the other:**
- **Curator (cheap):** reads the *full* WM + the live percept + the action catalog. Emits only **refs** — `{ pass: [...], remove: [...] }`. **Authors nothing**, can't garble content. `pass` = everything the executive will see (goal?, self?, `standing_on`?, `notable:i`?, note `n#`?, history `h#`?, *and which actions* `act:<verb>`?). `remove` = GC, **only** over accumulating WM contents (history + notes). It is **forward-looking**: pass what's needed to decide *and to plan* — including capabilities with unmet prerequisites (e.g. `act:smelt` so the executive learns it needs a furnace and plans to build one), omitting only what's irrelevant to the current decision/plan.
- **Executive (big):** reads only the hydrated slice the curator passed. Emits `{ thought, notes_to_add?, action }` and **authors all content**. Its action `kind` is constrained to the passed verbs. (Big model does all reasoning/planning in both arms → fairness preserved.)
- **Hydration layer:** expands each `pass` ref to verbatim data (goal text / percept fields / WM entry text / action usage-doc) and builds the executive's action output-enum from the passed `act:*` refs.

**Per-tick flow:**
```
percept_t = sense()
harness appends last outcome + new world-events → WM.history
{pass, remove} = CURATOR(full WM + percept_t)            ← cheap, ids only
apply remove (GC); hydrate(pass) → executive prompt + available verbs
{thought, notes_to_add, action} = EXECUTIVE(hydrated)    ← big, authors all content
harness appends thought+action → history, notes_to_add → notes; execute → outcome → history
```

**WM = one JSON document; everything accumulates here for the curator to choose from:**
```
WM {
  goal:    string                                  // constant: gate-able from a tick, NEVER removable
  history: [{id, tick, kind: thought|action|outcome|event, ...}]   accumulates → removable
  notes:   [{id, tick, text}]   (executive-authored)               accumulates → removable
}
action catalog: the 13 verbs — a fixed body capability, NOT stored in WM, referenceable as act:<verb>
```

**Bounding = the curator's `remove` (GC), nothing always-on, no floors.** The percept's bulk never enters WM (it's transient — the curator just passes a subset each tick), so WM grows only by ~1 thought + 1 outcome per tick + occasional notes; the curator must prune at least that fast to stay flat. Knowledge survives **only** if the executive promotes it into a `note` (raw history is GC-fodder). We do **not** hardcode always-on context or an action floor — that masked a curator-quality problem in Brutus (the action-trap) instead of fixing it; a bad curator is a build problem. The only safety net is *passive instrumentation*: a trap/no-progress detector ends + logs a stuck run (a recorded data point, never a changed curator behavior).

### The fair baseline parallel
The baseline carries the **same WM content** (goal + history + notes) but inside its message transcript, and its **compaction step preserves the same content**. So the comparison is *mechanism* (per-tick curated selection + GC vs periodic prose compaction of a dump), not *who remembers more*. Both arms reason/plan with the big model; both get the same shared percept.

**Memory scope for v1:** working memory only. No separate long-term/episodic store, no RAG. If later needed, it's added to **both** arms identically.

---

## How we compare them

**X-axis = tick = one environment action attempt.** Both arms take exactly one action per tick (auto-observe), so a tick is one unit of task-progress opportunity — the fair common axis. Cost-per-tick and time-per-tick then both mean "per step."

**Progress ladder — the diamond tech tree** (objective, detectable from inventory + craft events):
```
0 start → 1 logs → 2 planks → 3 crafting table → 4 wooden pickaxe
→ 5 cobblestone → 6 stone pickaxe → 7 iron ore → 8 furnace
→ 9 iron ingot → 10 iron pickaxe → 11 DIAMOND
```
`milestone` = highest rung reached. Monotonic, no judgment calls.

**Charts:**
1. **Cost rate** — x=tick, y=$/tick. Dimitri ≈ flat; baseline = rising sawtooth.
2. **Cumulative cost** — x=tick, y=total $. Dimitri ≈ linear; baseline = convex.
3. **Time rate** — x=tick, y=wall-clock seconds/tick. *Long context is also slower, not just costlier* — Dimitri's 2 small sequential calls vs the baseline's 1 call over a growing context (+ compaction spikes). Latency is already logged (`latencyMs`).
4. **Cumulative time** — x=tick, y=total wall-clock. The "how long to a diamond" axis.
5. **Progress-per-dollar** — x=cumulative $, y=milestone. The money chart: "diamonds per dollar," and the embodiment of the "task-completed-per-token, not cheaper-by-quitting-early" guardrail.
6. **Progress-over-time** — x=tick, y=milestone. A plateau = lost the plot → the **coherence** signal. (Track "ticks since last milestone"; long stalls = fixation.)

**Data:** charts 1–4 fall out of existing `llm.jsonl` ([gemini.ts:133](../src/llm/gemini.ts#L133)) priced by [metrics.ts:19](../src/llm/metrics.ts#L19). New work: add an inventory snapshot + computed `milestone` per tick to `ticks.jsonl`, and a post-run script that reads both runs and emits the charts/CSVs.

---

## Validity: replication, not a single run

A single diamond run proves nothing — map luck dominates. The experiment is **paired and replicated:**
- **Paired:** run both arms on the **same seed/spawn** so map difficulty cancels in the comparison.
- **Replicated:** repeat across many seeds spanning biomes and starting conditions (plains, forest, mountains, desert, near/far from caves, etc.).
- **Report distributions, not single numbers:** median diamonds-per-dollar, success rate, cost/time to each milestone, across N paired seeds.

**Setup changes this forces:**
- ✅ **World switched to normal + seeded** ([docker-compose.yml](../server/docker-compose.yml)): `LEVEL_TYPE: minecraft:normal`, `SEED: 4815162342`. The old flat world shifted terrain up so "deep" diamonds sat at y≈60, ~8m from spawn (confirmed via `pnpm sense:check`) — trivializing the task. Normal terrain puts diamonds at y≈−58, far outside the ±8 cube. **Apply with `pnpm server:reset` (destructive regen).** The harness will later vary SEED for replication (paired: same seed both arms).
- **Hostile mobs:** currently off (`SPAWN_MONSTERS=false`). Lean: keep off for v1 to reduce variance (control everything except the variable); revisit if it makes the task trivial/unrealistic.

---

## Build order

1. ✅ **Document this discussion** (this file).
2. ✅ **Shared general body** (`src/body/minecraft/general/`): bounded-x-ray perception, 13-verb action set, `Task` abstraction + `diamondTask`. Probes/sanity: `pnpm probe`, `pnpm sense:check`. World switched to normal+seeded.
3. ✅ **WM architecture LOCKED** (see "Working-memory architecture"): percept=present/WM=beyond-now; split writers (big plans, cheap remembers, harness recency); typed slots + notes; hard caps + curator eviction/consolidation.
4. **Dimitri (Arm A):** new agent using the general body → curator module (cheap, owns facts/notes) + reasoner module (big, owns plan/action) + the loop; completion via `diamondTask`. ← **NEXT (build)**
5. **Baseline (Arm B):** accumulation+compaction agent over the same body; compaction preserves the WM contract.
6. **Measurement:** milestone (`task.progress`) + inventory snapshot per tick in the tick log + post-run chart/CSV script.
7. **Run:** `pnpm server:reset` first; then paired across many seeds/biomes; produce the 6 charts as distributions.

---

## Open questions / decisions still pending

1. ✅ Shared-percept contents — decided + built (bounded x-ray; see "Shared perception").
2. ✅ WM architecture locked (see "Working-memory architecture"). Remaining: the exact curator *prompt* wording (tune during build), and whether caps (facts ≤12 etc.) need adjusting after first runs.
3. Compaction trigger value (token budget) and how many recent messages to keep verbatim.
4. The seed set spanning biomes; monsters on/off (world type ✅ normal+seeded).
5. Reasoner model held constant across arms (flash? larger?) and whether Dimitri's curator stays flash-lite.
6. New agents aren't wired into the registry/run-loop yet — the existing loop ([schedule.ts](../src/brain/schedule.ts)) is built around the old `RawPercept`; Dimitri/baseline need their own loops over the general `Percept`.

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-29 | Created. Pivot off "aliveness" to the falsifiable context-management A/B; defined both arms; byte-by-byte map of the current loop; shared-perception + WM-parallel + replication decisions; diamond goal; 6-chart comparison incl. time axes. |
| 2026-05-29 | Built the shared general body: bounded-x-ray percept (standing_on + radius-1 near + notable-to-8, no air/bulk), 13-verb action set (added smelt/activate/drop), Task abstraction + diamondTask, `Body` made percept-generic. World switched to normal+seeded. Probe + sense-check tools. |
| 2026-05-29 | Locked Dimitri's WM architecture: percept=present / WM=beyond-now; split writers (big reasoner plans, cheap curator remembers, harness owns deterministic recency); typed slots + freeform notes; hard caps with curator value-based eviction + consolidation (facts≤12, schema-enforced). Fairness: big model plans in both arms. |
