# minecraft-bot

An LLM-driven Minecraft agent. Minecraft is the testbed; the **brain architecture is the actual product** being iterated on.

## Architecture (M1 — minimal)

```
BRAIN  (a function: snapshot → actions[])
  ↑ reads                      ↓ returns
WorldSnapshot               Action[]
  ↑                            ↓
BODY  (mineflayer wrapper: perception + execute)
                ↕
       Minecraft server (local)
```

- A brain is `(snapshot: WorldSnapshot) => Promise<Action[]>` — a plain function. Compose them at the call site (function composition for serial, `Promise.all` for parallel).
- The body keeps a mutable `WorldState` fresh from mineflayer events; the brain only ever sees a deep-frozen `snapshot()`.
- Actions are typed values; the body validates them with zod before dispatching to mineflayer.

See [the plan file](../../.claude/plans/zany-munching-perlis.md) (local dev only) for the full design rationale.

## Prerequisites

- Node 20+, pnpm 10+
- Docker + Docker Compose v2
- A Minecraft Java Edition client (for visually verifying the bot)

## Quickstart

```sh
# 1. Install deps
pnpm install

# 2. Start the local Minecraft server (PaperMC 1.20.4, offline mode)
pnpm server:up
pnpm server:logs   # wait for "Done (Xs)! For help, type "help""

# 3. (Optional) copy env and tweak
cp .env.example .env

# 4. Run the bot
pnpm dev
```

**Watch the bot — two options:**

- **Free:** open <http://localhost:3000> in any browser. The prismarine-viewer renders the world from the bot's perspective (3rd-person by default; set `VIEWER_FIRST_PERSON=true` in `.env` to switch). No Minecraft purchase required.
- **Paid (only if you want to play in the world yourself):** connect a Minecraft 1.20.4 Java Edition client to `localhost:25565`. Java Edition is a one-time ~$30 purchase from minecraft.net.

Stop the server with `pnpm server:down`.

**World generation.** Default world is a **superflat plains preset** — flat grass with scattered trees, no caves/ravines/oceans. Ideal for early bot testing. To swap to varied terrain, edit [server/docker-compose.yml](server/docker-compose.yml): remove `LEVEL_TYPE` + `GENERATOR_SETTINGS`, add `SEED: <number>`, bump `LEVEL`, then `pnpm server:reset`.

## What M1 does

- Connects, spawns, perceives the world.
- Hard-coded brain walks the bot around a 10×10 square, chatting at each corner.
- No LLM yet — that's M2.

## Layout

```
src/
  brain/types.ts        # WorldSnapshot, Action, Brain (the contracts)
  body/
    bot.ts              # mineflayer factory + lifecycle
    world-state.ts      # mutable world model + snapshot()
    perception.ts       # mineflayer events → world-state
    execute.ts          # Action → mineflayer call (zod-validated)
  loop.ts               # ~30-line action-driven brain loop
  config.ts             # env vars (typed via zod)
  logger.ts             # pino
  main.ts               # entrypoint
server/
  docker-compose.yml    # itzg/minecraft-server, PaperMC, offline mode
test/
  world-state.test.ts
  action-schema.test.ts
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run the bot with hot reload (tsx watch) |
| `pnpm start` | Run the bot once |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run vitest |
| `pnpm server:up` | Start local MC server |
| `pnpm server:down` | Stop local MC server |
| `pnpm server:logs` | Tail server logs |

## Roadmap

- **M1** ✅ Body + hard-coded brain. Demonstrates the loop end-to-end without an LLM.
- **M2** Add `Perceiver` brain — Gemini summarizes the snapshot every tick. No actions yet.
- **M3** Add `Executor` brain — Gemini chooses actions via function-calling. First fully LLM-driven loop.
- **M4** First evolution driven by whatever pain M3 reveals (parallel ChatResponder, stuck detection, etc.). The shape of a `BrainModule` interface gets decided *here*, after we've felt the need — not before.
