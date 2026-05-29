# Vision & Direction

_Living document. Created 2026-05-28 from a deep strategy discussion. This is the "why are we doing this at all, and what does winning look like" companion to [NOTES.md](../NOTES.md) (architecture rationale) and [brutus-review-and-charlie-direction.md](brutus-review-and-charlie-direction.md) (implementation reflection)._

---

## The one-sentence thesis

**On open-ended, long-horizon tasks, a biologically-factored, bounded-context cognitive architecture (small model + memory) stays coherent and keeps cost roughly flat as the horizon grows — where a monolithic large-context agent's cost grows with the horizon until it becomes incoherent or unaffordable.**

That is the falsifiable, measurable, economically-meaningful claim. Everything else ("alive", "human-like") is the *story*; this is the *bet*.

---

## What we decided (and what we explicitly ruled out)

### Decided

1. **The product is the mind, not the Minecraft bot.** Minecraft is a swappable body. The asset is the environment-agnostic brain.
2. **Ultimate target = a digital persistent agent**, specifically a **self-directed, persistent, curious EXPLORER / being** — combining persistence + entertainment ("watch it grow") with a thesis that *persistence + freedom for AI can produce good outcomes.* NOT the autonomous-worker domain (too crowded, everyone is building it).
3. **Proof strategy = an "AlexNet moment" via one brain, multiple bodies.**
   - Body 1 = Minecraft: cheap lab + the "watch it grow" being.
   - Body 2 (later) = a problem-solving body pointed at an open-ended benchmark/competition for an objective, legible, external win.
   - The *transfer between bodies* = the env-agnostic thesis. The *win* = the proof. The *Minecraft growth* = the aliveness.
4. **Method shift: controlled experiments, not vibe-checking.** The root problem so far was making changes and judging them by "how well it played Minecraft." Going forward: fixed scenario, one variable, a metric, a baseline, keep-or-kill. 3-day milestones measured as *questions answered*, not *features shipped*.

### Ruled out / corrected

- **"Plays Minecraft effectively" as the bar** — wrong yardstick. A purpose-built bot beats a mind at any single bounded task. Importing a task-runner metric contradicts the existential framing.
- **"General beats specialized for MOST tasks"** — false and a losing fight. For bounded/specifiable tasks, specialized wins on cost/latency/reliability. The defensible claim is general beats specialized *only for tasks you can't write a spec for* (open-ended / long-horizon / novel), and the general layer's role is to *orchestrate* specialists, not replace them.
- **Biomimetic fidelity as the source of value.** Brain-region naming is a useful *heuristic for finding the right modules* and a *narrative asset* — but copying neuroanatomy for its own sake is the ornithopter trap. Hand-built cognitive architectures (SOAR, ACT-R, LIDA) tried this for ~40 years and did not produce general intelligence. The expendable part is the *fidelity*; the value (env-agnostic boundary, honest perception, bounded memory, drive-gating, attention bottleneck) survives without it. The genuinely new ingredient is the **LLM substrate** — modules are thin orchestration over a pretrained general mind, which the SOAR era never had.
- **Prize arenas that favor specialists** (ARC-AGI, Kaggle, AIMO math). They have the money but a win there disproves the thesis (persistence/agency irrelevant, specialists win).

---

## The two axes we win on

1. **Cost / context flatness over horizon.** Monolithic agents grow context (and $$) with task length. A bounded-context architecture should stay roughly flat. → chart: cost-per-horizon, completion-over-horizon.
2. **Generality under an unknown goal.** One brain, *arbitrary* natural-language goal, zero task-specific code. No single script does "get diamond" AND "defeat the ender dragon" AND "gain 100 wheat" — and you don't know which will be asked. (Always frame as *arbitrary/unknown* goal; "this specific goal" hands the win to a specialist.)

**Honest competitor note:** the real baseline is NOT a naive "stuff everything in the context window" agent — nobody serious runs those for long horizons. Competitors use summarization, RAG, and sub-agents. The edge must be demonstrated against *those*: a principled cognitive architecture does bounded-context long-horizon work *more cheaply and coherently* than ad-hoc compaction.

---

## The two-stage hypothesis (sharpened)

- **Stage 1 — it adapts from its own experience without hand-coded adaptation.** ("Alive" is the story; "adapts" is the falsifiable claim. Do not conflate them — that conflation was the recurring mixup.)
- **Stage 2 — a general adaptive mind beats specialized/monolithic systems on open-ended long-horizon tasks**, especially on cost/coherence as the horizon grows.

### Two hypotheses to keep separate

- **H1:** "coherence comes from context routing, not model size." (Sound, testable, half-proven by the field.)
- **H2:** "the right routing is to copy brain regions." (Risky; redeemed only by the LLM-substrate twist. Don't bet the company on fidelity.)

---

## Candidate proving arenas

The hard design rule: **persistence + self-direction must be what wins the arena** — a specialized one-shot system must demonstrably *fail* at it. Otherwise it's the "specialized beats general" trap with prize money attached.

| Arena | Why it fits | Prize / legibility |
|---|---|---|
| **NetHack** (NetHack Learning Environment) | RL graveyard — procedural, permadeath, huge knowledge + adaptation; rule-based bots beat deep RL; cheap ASCII | NeurIPS challenge had prizes (2021); high credibility |
| **Pokémon** (Claude/Gemini-Plays-Pokémon style) | Blew up 2025 as a long-horizon agent test; current agents struggle over a full playthrough; very relatable | No prize, but huge public attention = an AlexNet-style legibility win |
| **Factorio** (Factorio Learning Environment) | Brutally long-horizon open-ended automation; hard for LLMs | Research benchmark; relatable ("build a factory") |
| **Crafter / Craftax** | Open-ended survival, published achievement score, very cheap (Craftax = JAX/fast) | Research benchmark, easy baselines to beat |
| **Minecraft** (MineDojo / obtain-diamond) | Already invested; rewards long-horizon persistence directly | NeurIPS MineRL had prizes; reuses all current work |

**Avoid:** ARC-AGI, Kaggle, AIMO — prize money but specialists win, persistence irrelevant.

**Blunt read:** literal prize money is thin and mostly in specialist arenas. The benchmark-credibility win (NetHack / Pokémon / Factorio — "this small architecture did the long-horizon thing GPT-class agents can't afford") is more achievable *and* often worth more than the purse.

---

## What transfers across bodies (and what doesn't)

- **Transfers:** memory, drives, attention, the body/brain boundary.
- **Does NOT transfer:** everything spatial (heightmap, FOV, mine/place). → Stop over-investing in spatial perception; you're leaving Minecraft eventually.

---

## The hard problem digital persistence introduces: stakes — and a candidate solution

Minecraft gives stakes for free (hunger, damage, death) → motivation is grounded without writing any. A purely digital agent has **none** — nothing runs out, nothing can kill it. Inventing stakes for a being that can't die is the central design problem and where the limbic module becomes the differentiator. (This is *why* digital is cheaper to iterate but harder to make *alive* than Minecraft.)

### Candidate solution (2026-05-28): energy = token budget

Give the agent an **"energy" scalar tied to real token spend.** As energy approaches zero, abilities diminish mechanically — downshift the model (Flash → Flash-Lite), shrink memory retrieval, narrow the option set — like fatigue/hunger in a human; at zero it is incapacitated/dies. Why this is strong:

- **It fuses the stakes problem with the core thesis.** The survival drive *is* the cost-discipline the architecture exists to prove. An agent that wants to live is an agent that wants to be token-efficient over a long horizon — the phenomenology and the business case become one scalar. Unlike most "make it feel alive" mechanisms, this one pays for itself.
- **Body-agnostic and grounded in our world** — tokens are universal, so stakes work in any environment, game or digital.
- **The right kind of biomimicry** — metabolic energy economy is a real organizing principle of cognition (the brain is ~20% of metabolic budget; fatigue genuinely degrades performance), not cosmetic.
- Degradation is **mechanically real** (actually less compute when "tired"), not a label the agent is told to roleplay.

**The real design work is replenishment, not depletion.** Depletion is trivial; if energy only falls it's a countdown timer, not stakes. How energy is *regained* defines the agent's entire personality:
- **rest/time-based** (sleep rhythm) — simple, but decouples regen from doing anything valuable;
- **achievement-based** (completing self-set goals grants energy) — ties survival to productivity, but risks smuggling in an assigned goal (violates the "no assigned task" constraint);
- **economic** (earns credits/money for valuable output, which buys tokens) — a *self-sustaining being*; aligns perfectly with the prize-competition vision: **winning literally = earning the right to keep thinking.** This is the endgame version.

**For it to actually reduce spend, energy must GATE deliberation, not just count down.** The loop must be: *feel low energy → choose cheaper actions → spend fewer tokens.* If it's just a number that kills the agent, it caps runtime without changing behavior. (This is the "drives must *bite*, not merely *inform*" requirement, now load-bearing — the energy signal must reach into the PFC's option selection.)

**Open design choices:**
- **Permadeath** (NetHack-style — maximal stakes, but short high-variance runs, bad for repeatable experiments) vs **recoverable** (basal regen floor — a sustainable being observable over weeks)?
- **Death-spiral risk:** low energy → dumber model → worse decisions → can't replenish → death. Feature (real consequence/selection) or bug (inevitable spiral once it dips)? Needs a floor or an accepted-mortality stance.
- **Measurement caveat:** the win is *more task completed per token*, not *cheaper by quitting early*. A frugal agent that dies before finishing isn't beating the monolithic one.

This also lets the existing deterministic drives (hunger, futility, discomfort in `src/brain/drives.ts`) be **unified around a single energy economy** instead of separate ad-hoc formulas.

---

## Body / brain boundary principle

- **Body returns honest, physically-limited facts** (FOV, occlusion, range) + the **affordance set** (what it can do given current state). It is NOT omniscient — the "x-ray ore" radar is a bug because seeing buried ore is a database query, not a sensor reading.
- **Brain owns attention** (what to think about) and **action selection**.
- Litmus test for the boundary: *"could this sensor physically produce this fact?"* If it requires knowing something unseen → it's memory/inference (brain), derived from past honest percepts. "I saw coal to the SW yesterday" is a memory, not a sensor reading.

---

## Immediate next step (do not gate on prize money)

Prize/benchmark wins are months out and high-variance. The near-term proof is cheap and falsifiable:

**The escape-the-hole adaptation experiment** (already proposed in brutus-review):
- Scenario: agent stuck in a hole; must place blocks to climb out.
- Metric: ticks-to-escape (or success rate) on repeated encounters.
- Hypothesis: an agent with episodic memory escapes faster on the 2nd/3rd encounter than the 1st, and faster than a no-memory baseline.
- One variable: memory on vs off. Same seed, ~5–10 trials each.
- Kill condition: if memory-on doesn't beat memory-off, the adaptation thesis is wounded — a real result in 3 days.

This is the cost/coherence-over-horizon edge in miniature, and the mechanism (memory → adaptation) is body-agnostic, so it transfers.

---

## Open questions to research

1. Which long-horizon open-ended arenas have real prizes vs. real *credibility* — and which make persistence genuinely load-bearing?
2. What is the concrete monolithic-agent baseline to beat (which framework, what compaction strategy), and how do we measure cost-per-horizon fairly?
3. For the digital body: what are the *stakes*? What does an undying digital explorer fear, want, get bored of, feel satisfied by?
4. Does the Thalamus survive once perception is honest + memory exists, or does memory-retrieval + raw percept replace attention filtering?

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-28 | Created from strategy discussion: target = digital persistent explorer; thesis = bounded-context beats brute-horizon on open-ended long-horizon tasks; AlexNet-style proof via one-brain/multi-body; arena shortlist. |
| 2026-05-28 | Added candidate solution to the stakes problem: **energy = token budget** (fuses stakes with the cost thesis); key open question is replenishment mechanism. |
