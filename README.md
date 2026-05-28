# minecraft-bot — Atticus

An LLM-driven agent named **Atticus** living in a Minecraft world. Minecraft is the testbed; the **brain architecture is the actual product** being iterated on. The brain is built to be plug-and-play across environments.

## Architecture

Three layers, two boundaries. The brain doesn't know it's in Minecraft.

```
┌────────────────────────────────────────────────────────────┐
│  BRAIN  (environment-agnostic)                             │
│                                                            │
│    Thalamus (Attention) ──┐                                │
│      reads percept + WM   │ emits ThalamusOutput:          │
│      slice + action names │   focus_refs[] (pointers)      │
│                           │   actions_in_play[]            │
│                           │   brief?                       │
│                           ▼                                │
│    Schedule hydrates refs → FocusItem[]                    │
│                           │                                │
│    PFC (Executive) ◄──────┘ reads hydrated focus + WM      │
│      slice + filtered action menu → Decision               │
│                                                            │
│    ┌──────────────────────────────────────┐                │
│    │  WORKING MEMORY (persistent)         │                │
│    │  identity                            │                │
│    │  self                                │                │
│    │  intention                           │                │
│    │  event_log[]  (last 50)              │                │
│    └──────────────────────────────────────┘                │
└────────────────────────────────────────────────────────────┘
                       ↕
┌────────────────────────────────────────────────────────────┐
│  BODY  (env-specific impl of Body<TAction> interface)      │
│  sense() → RawPercept (self, terrain, scene, entities,     │
│                        new_events)                         │
│  execute(Action) → void                                    │
│  describeActions() → ActionDoc[]                           │
└────────────────────────────────────────────────────────────┘
                       ↕
              [Minecraft | …]
```

- **Body** (`src/agents/<name>/body/minecraft/`) — each agent owns its body fork. Implements `Body<TAction>` from [src/body/types.ts](src/body/types.ts), including `describeActions()` so the brain's prompts can be rendered from env-declared verbs.
- **Working Memory** (`src/brain/workspace.ts`) is the persistent slice: identity, self, intention, and a unified `event_log` of thoughts, actions, damage, percept changes, and chat. Focus is **not** stored — it's transient per tick.
- **Thalamus** (`src/brain/attention.ts`) reads the full percept + WM slice + the names of available actions and emits a tiny `ThalamusOutput`: `focus_refs[]` (pointers into percept/events/self), `actions_in_play[]` (action names that matter right now), and an optional `brief`.
- **Schedule** (`src/brain/schedule.ts`) hydrates each ref into a `FocusItem` with the original structured data, filters the action menu by `actions_in_play`, and hands the result to the PFC. This is what keeps the PFC's input lean and unparaphrased.
- **PFC** (`src/brain/executive.ts`) reads the hydrated focus + self + intention + recent events + filtered action menu → returns thought + intention + one action.

Latency per module is set by **model choice**, not throttling. Thalamus uses the fast model (filtering); PFC uses the more deliberate model (decision).

## Prerequisites

- Node 20+, pnpm 10+
- Docker + Docker Compose v2
- A Gemini API key — free at <https://aistudio.google.com/apikey>

## Quickstart

```sh
pnpm install

# Local Minecraft server (superflat plains, no caves/oceans)
pnpm server:up
pnpm server:logs           # wait for "Done (Xs)!"

cp .env.example .env       # paste your GEMINI_API_KEY

pnpm dev
```

**Watch Atticus:**
- Open <http://localhost:3000> for the 3rd-person view, <http://localhost:3001> for 1st-person. Free — no Minecraft client needed.
- (Optional) connect a Minecraft 1.20.4 Java Edition client to `localhost:25565` to play alongside him.

Stop server with `pnpm server:down`. Re-roll world with `pnpm server:reset`.

## Layout

```
src/
├── agents/                      # one folder per agent (alphabet line)
│   ├── types.ts                 # AgentDefinition contract
│   ├── identity.ts              # shared existential framing template
│   ├── registry.ts              # atticus, brutus, … + spawn resolution
│   ├── run-agent.ts             # boot + run one agent
│   ├── atticus/
│   │   ├── index.ts             # username, WM path, viewer ports
│   │   └── body/minecraft/      # frozen baseline body
│   └── brutus/
│       ├── index.ts
│       └── body/minecraft/      # fork for experiments (drives, FOV, …)
├── body/
│   └── types.ts                 # Body interface, RawPercept (env-agnostic)
├── brain/                       # shared cognitive modules
│   ├── workspace.ts
│   ├── attention.ts             # Thalamus
│   ├── executive.ts             # PFC
│   └── schedule.ts              # conscious loop
├── llm/
│   ├── gemini.ts
│   └── metrics.ts               # createMetrics(agentId) — one per agent
├── config.ts
├── logger.ts
└── main.ts                      # spawns selected agents
```

## Spawning agents

Default is Atticus only. Pick agents via CLI or `AGENTS` env:

```sh
pnpm dev                        # atticus
pnpm dev -- atticus brutus      # both in same world
AGENTS=brutus pnpm dev          # brutus only
pnpm dev:both                   # shortcut
```

Each agent gets its own MC username, WM file (`server/data/<agent>-wm.json`), viewer ports, and cost summary. One Gemini key; metrics never shared.

## Per-tick cost budget

Each Gemini call logs `caller`, `model`, `inputTokens`, `outputTokens`, `latencyMs`. Typical:

| Module | Model | ~In / Out tok | Cost / tick |
|---|---|---|---|
| Attention | `gemini-2.5-flash-lite` | 860 / 150 | ~$0.00015 |
| Executive | `gemini-2.5-flash` | 390 / 200 | ~$0.00062 |
| **Total** | | | **~$0.00077** |

At 2–3 ticks/min (action-driven): **~$0.10/hour**.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Atticus only (default) |
| `pnpm dev:atticus` | Atticus only |
| `pnpm dev:brutus` | Brutus only |
| `pnpm dev:both` | Atticus + Brutus in same world |
| `pnpm start` | Run once (respects `AGENTS` / CLI args) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run vitest |
| `pnpm server:up` / `:down` / `:logs` | Manage local MC server |
| `pnpm server:reset` | Wipe world + restart server |

## Adding a new agent (Charlie, …)

1. Copy `src/agents/brutus/` → `src/agents/charlie/`.
2. Update `index.ts`: id, displayName, mcUsername, wmPath, viewer ports.
3. Register in `src/agents/registry.ts`.
4. Add username to `OPS` in `server/docker-compose.yml`.
5. Never merge changes backward into earlier agents.

## Adding a new brain module

A brain module is just a function:

```ts
type BrainModule<In, Out> = (input: In) => Promise<Out>
```

To add one (e.g. a Brainstem that watches vitals):

1. Add a `patchFromBrainstem()` writer + `sliceForBrainstem()` reader to [src/brain/workspace.ts](src/brain/workspace.ts).
2. Write the module file alongside `attention.ts` / `executive.ts`.
3. Slot it into [src/brain/schedule.ts](src/brain/schedule.ts) — serial for now, `Promise.all` when it should run parallel to another module.

That's it. No framework, no DI container, no registry.

## Adding a new environment

Atticus's brain doesn't know it's in Minecraft. To run him elsewhere:

1. Create `src/body/<your-env>/` implementing the `Body<TAction>` interface from [src/body/types.ts](src/body/types.ts).
2. Produce `RawPercept` from your env's sensors (some fields may be empty — that's fine).
3. Define your env's Action types and an `execute()` for them.
4. Point `main.ts` at the new body factory.

The brain modules, workspace, and schedule come along unchanged.
