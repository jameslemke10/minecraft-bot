# Atticus — Project Notes & Design Rationale

_Living document. Last updated: 2026-05-28._

This is the "why and where" companion to the [README](README.md) (which is the "what and how"). It captures the hypothesis we're testing, the architecture as it actually stands, the problems we've hit and how we resolved them, and what's next.

---

## The hypothesis

**Minecraft is the testbed; the brain is the product.** Atticus is the first agent in a longer arc (Brian, Charlie, … in other environments). The bet has three layers:

1. **Coherent autonomous behavior comes from context management, not model size.** Most of what looks like "stupidity" in an LLM agent is the wrong information reaching the wrong module at the wrong time. If we get the *flow of context* right — what each module sees, when, and in what shape — a cheap model can behave coherently. We're deliberately using small models (Gemini Flash / Flash-Lite) to force this discipline.

2. **A biologically-inspired, modular cognitive architecture is the right substrate.** Perception → attention (Thalamus) → working memory → deliberation (PFC) → action, with each module reading only the slice it needs. New faculties (drives, memory, reflexes) slot in as new modules without rewriting the loop.

3. **The brain is environment-agnostic and portable.** The brain never imports anything Minecraft-specific. Swapping environments means writing a new `Body`; the brain comes along unchanged. This is what makes Atticus's mind reusable for future agents.

**Atticus is an existential agent, not a task-runner.** There is no assigned goal and no score. He is "alive to make his life what he wants." This constraint matters for every design decision: motivation must be *intrinsic* (curiosity, boredom, comfort, mastery), never an injected to-do list.

The thing we are ultimately trying to prove: **that a small, well-orchestrated, biologically-factored mind with the right intrinsic drives produces open-ended, self-directed, believably-alive behavior** — and that the same mind transfers across bodies and worlds.

---

## Architecture as built

Three layers, two boundaries. The brain doesn't know it's in Minecraft.

```
BODY (env-specific)  →  WORKING MEMORY  →  BRAIN MODULES (env-agnostic)
 sense()/execute()      persistent state    Thalamus → [hydrate] → PFC
 describeActions()                          (funnel)            (decide)
```

- **Body** (`src/agents/<name>/body/minecraft/`) — only thing that knows mineflayer exists. Each agent owns its body fork; they never merge backward. Implements `Body<TAction>` from [src/body/types.ts](src/body/types.ts): `sense() → RawPercept`, `execute(action)`, `disconnect()`, `describeActions() → ActionDoc[]`.
  - Sensors compose a `RawPercept`: `self` (pos/vitals/inventory/motion), `terrain` (biome/time/weather), `scene` (16×16 surface heightmap + clustered objects), `nearby_entities`, `new_events`.
- **Working Memory** (`src/brain/workspace.ts`) — persistent across ticks AND restarts (JSON at `server/data/<agent>-wm.json`). Holds `identity`, `self`, `intention`, and a unified `event_log` (thoughts, actions, damage, percept-changes, chat). Focus is **not** stored — it's transient per tick.
- **Thalamus / Attention** (`src/brain/attention.ts`) — the funnel. Reads the full percept + WM slice + the action menu, and emits a tiny `ThalamusOutput`: `focus_refs` (pointers into the percept/events/self), `actions_in_play` (which verbs are relevant), and an optional `brief`. Uses the fast model.
- **Hydration** (`src/brain/schedule.ts`) — resolves each `focus_ref` back to its full structured data before the PFC sees it, and filters the action menu by `actions_in_play` (baseline `move`/`chat`/`wait` always kept). This keeps the PFC's input small and unparaphrased.
- **PFC / Executive** (`src/brain/executive.ts`) — deliberates on the hydrated focus + self + intention + recent events + filtered action menu → one `thought` + `intention` + `action`. Uses the deliberate model.
- **Schedule** (`src/brain/schedule.ts`) — the conscious loop: sense → Thalamus → hydrate → PFC → act. Serial for now.

Action set (Minecraft body): `move, chat, wait, mine, place, craft, equip, attack, eat, sleep`.

Per-run cost/latency accounting in [src/llm/metrics.ts](src/llm/metrics.ts), printed every 10 ticks and on shutdown.

---

## What works now

- End-to-end loop runs continuously, action-driven, with full prompt/response logging.
- Rich perception: biome, time, weather, a spatial surface map (absolute world coords + elevation), clustered objects (trees, ore veins, water, mobs), structured event history.
- Environment-agnostic boundary holds: the brain imports nothing from `body/minecraft/`.
- Working memory survives Ctrl+C → restart (identity, intention, event log persist; transient focus correctly does not).
- Clean spawn on flat plains (no more falling-through / canopy / mountain spawns).
- Cost/latency visibility per stage.

---

## Problems we've seen

| Problem | Status | Resolution / notes |
|---|---|---|
| Sensory poverty → confabulated "warm sun" prose | ✅ fixed | Added terrain + scene sensors; perception is now grounded. |
| "Salient" naming muddled WM vs. attention | ✅ fixed | Renamed to **Focus**; WM is the persistent layer, Focus is the per-tick spotlight. |
| Thalamus restating percept (high output tokens) | ✅ fixed | Funnel design: emits refs, schedule hydrates. |
| Spawned-in-air panic / "I'm falling" delusion | ✅ fixed | Settle-on-ground before first tick; flat plains; absolute-y heightmap; prominent STATUS line. |
| Action trap (Thalamus collapsing menu to one option) | ✅ fixed | `move`/`chat`/`wait` are `always` actions; the filter only *adds* context verbs. |
| Thalamus filtering actions **blind** (saw only names) | ✅ fixed | Thalamus now gets full action descriptions + explicit focus→verb mapping. |
| Biome non-determinism (jungle/desert spawns) | ✅ fixed | Paper ignores `single_biome`; switched to superflat plains preset. |
| Cost ~$1.30/hr (≈12× the original estimate) | ⏸️ deferred | Driver = verbose PFC thoughts re-fed ~20×, plus rapid idle ticking. Fix later: cap thought length, idle-skip. |
| **Fixation / loops with no escape** | 🔴 open | Watches a sheep forever; chases an impossible goal forever. No boredom, no progress signal, no satisfaction. **This is the central open problem.** |
| **Superhuman perception** (sees ore through dirt, sees behind himself) | 🔴 open | Scene sensor reports unreachable/occluded blocks as targets. Needs a field-of-view + spatial-reasoning rework. |

---

## The central open problem: no motivation

The architecture has perception (Thalamus), deliberation (PFC), and memory (WM) — but **nothing that makes Atticus *want* anything.** The PFC deliberates well, but with no value gradient "watch a sheep forever" scores exactly as well as "build a shelter." Symptoms we've directly observed:

- Locks onto the nearest moving thing (a baby obsessed with motion) and observes it indefinitely.
- Adopts an impossible intention ("descend to the buried copper") and re-justifies the same futile micro-action every tick in verbose paragraphs.
- A stale intention self-reinforces: intention → brief → thought → intention, with no negative feedback to break it.

Biologically, the missing piece is the **limbic system / drives** — the source of hunger, fear, comfort, curiosity, boredom, and satisfaction. Two forces in particular would break the loops we see:

- **Habituation / boredom** — novelty should decay; staring at the same thing should *feel* less rewarding over time.
- **Progress / futility sensing** — repeating an action with no change should raise restlessness and prompt a different approach.
- **Survival urgency** — hunger is enabled (peaceful + `easy` difficulty so the food bar depletes) but isn't yet *felt* as a drive that shapes priorities.

**Hard constraint:** drives must be intrinsic, not assigned tasks. The goal is to make idleness *feel* unsatisfying and novelty/mastery *feel* rewarding, then let the PFC chase that — not to hand him a quest log.

---

## Next steps (ordered)

1. **Design & build the Drive system (limbic module).** A new env-agnostic module that each tick produces a small set of felt needs/moods (hunger urgency, boredom/habituation, curiosity, comfort, satisfaction/progress) and feeds them into the PFC's slice as a value gradient. Plan this deliberately — "what drives, and how do they update" is the crux. This is the immediate next session.
2. **Field-of-view perception + spatial reasoning** (later). Stop reporting occluded/unreachable blocks. Give Atticus a real visual field (he shouldn't see ore through dirt or things behind him), and a separate system to reason about space. This is a meaningful rework, intentionally deferred.
3. **Cost/latency pass** (later). Cap PFC thought length (also reduces narrative-loop self-reinforcement), skip/slow LLM calls when idle, trim the heightmap. Not urgent for short test runs.

---

## Parking lot (deliberately not building yet)

- Long-term / episodic memory (Hippocampus).
- Parallel modules (a reflexive Brainstem watching vitals; a default-mode "mind-wandering" when idle).
- Skill library (learned action patterns).
- Multi-agent on one server (Atticus + Brutus). See `src/agents/`.
- Generic prompt templating across environments.

---

## Operating notes

- **Run:** `pnpm server:up && pnpm dev` (defaults to Atticus only).
- **Choose agents:** CLI args or `AGENTS` env — `pnpm dev -- atticus brutus`, `AGENTS=brutus pnpm dev`, or shortcuts `pnpm dev:atticus`, `pnpm dev:brutus`, `pnpm dev:both`.
- **Agent layout:** each letter owns `src/agents/<name>/` — `identity.ts`, `body/`, and `data/` (WM + drive state). Shared brain in `src/brain/`. Agents never merge backward.
- **World:** superflat plains with trees, no villages (`server/docker-compose.yml`). Survival mode, `easy` difficulty, `SPAWN_MONSTERS=false` (hunger drains, no hostiles distracting perception/motivation work).
- **Reset a mind:** `rm src/agents/<name>/data/wm.json`. `pnpm server:reset` only wipes the Minecraft world.
- **Watch them:** viewer ports are per-agent — Atticus `:3000`/`:3001`, Brutus `:3010`/`:3011`.
- **Cost/latency:** per-agent summary printed every 10 ticks and on Ctrl+C.
- **Models:** Thalamus = `gemini-2.5-flash-lite` (fast filtering), PFC = `gemini-2.5-flash` (deliberation). One Gemini key shared; metrics isolated per agent.
