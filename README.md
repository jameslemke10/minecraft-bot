# minecraft-bot — Atticus

An LLM-driven agent named **Atticus** living in a Minecraft world. Minecraft is the testbed; the **brain architecture is the actual product** being iterated on. The brain is built to be plug-and-play across environments.

## Architecture

Three layers, two boundaries. The brain doesn't know it's in Minecraft.

```
┌──────────────────────────────────────────────┐
│  BRAIN  (environment-agnostic)               │
│                                              │
│    Attention (Thalamus)  ┐                   │
│         ↓ writes salient[], self             │
│    ┌──────────────────┐  │                   │
│    │  WORKING MEMORY  │  │                   │
│    │  identity        │  │  selective        │
│    │  self            │  │  slices per       │
│    │  salient[]       │  │  module           │
│    │  intention       │  │                   │
│    │  recent_thoughts │  │                   │
│    └──────────────────┘  │                   │
│         ↓ reads slice                        │
│    Executive (PFC) → returns Action[]        │
└──────────────────────────────────────────────┘
                       ↕
┌──────────────────────────────────────────────┐
│  BODY  (env-specific impl of Body interface) │
│  sense() → RawPercept                        │
│  execute(Action) → void                      │
└──────────────────────────────────────────────┘
                       ↕
              [Minecraft | …]
```

- **Body** (`src/body/minecraft/`) is the only thing that knows mineflayer exists. Implements the `Body` interface from [src/body/types.ts](src/body/types.ts).
- **Working Memory** (`src/brain/workspace.ts`) is the shared workspace. Modules read/write only declared slices.
- **Brain modules** are env-agnostic. Two so far:
  - **Attention** ("Thalamus") — filters raw perception into 0–5 salient items. Uses the fast/cheap model.
  - **Executive** ("PFC") — reads only the workspace slice, decides what to think and do. Uses the more deliberate model.
- **Schedule** (`src/brain/schedule.ts`) — the conscious loop. Serial: sense → Attention → Executive → act.

Latency per module is set by **model choice**, not throttling. Add a new module by writing a function with the right slice contract and slotting it into `schedule.ts`.

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
├── body/
│   ├── types.ts                 # Body interface, RawPercept (env-agnostic)
│   └── minecraft/               # env-specific impl
│       ├── index.ts             # createMinecraftBody()
│       ├── world-state.ts       # event ring buffer
│       ├── perception.ts        # mineflayer events → event buffer
│       ├── execute.ts           # Action → mineflayer call (zod-validated)
│       └── sensors/             # build RawPercept from the live bot
│           ├── self.ts          # position, vitals, inventory
│           ├── terrain.ts       # biome, time, weather, blocks
│           ├── entities.ts      # nearby mobs/players/items
│           └── index.ts         # composes into RawPercept
├── brain/                       # env-agnostic
│   ├── types.ts                 # Action, WorkingMemory, SalientItem, Thought
│   ├── identity.ts              # ATTICUS_IDENTITY constant
│   ├── workspace.ts             # WorkingMemory + sliceFor* helpers
│   ├── attention.ts             # Attention (Thalamus) module
│   ├── executive.ts             # Executive (PFC) module
│   └── schedule.ts              # the conscious loop
├── llm/
│   └── gemini.ts                # @google/genai wrapper, per-call model + JSON mode
├── config.ts                    # env vars (typed via zod)
├── logger.ts
└── main.ts                      # entrypoint
```

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
| `pnpm dev` | Run with hot reload |
| `pnpm start` | Run once |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run vitest |
| `pnpm server:up` / `:down` / `:logs` | Manage local MC server |
| `pnpm server:reset` | Wipe world + restart server |

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
