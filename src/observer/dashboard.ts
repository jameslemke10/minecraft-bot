import { createServer, type Server } from 'node:http'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPortFree } from '../body/viewer.js'
import { logger } from '../logger.js'

export type ObserverPhase = 'idle' | 'sensing' | 'curating' | 'deciding' | 'acting'

export interface ObserverSnapshot {
  agentId: string
  tick: number
  phase: ObserverPhase
  /** Human-readable detail, e.g. action kind + args while executing. */
  phaseDetail?: string
  updatedAt: string
  milestone: { score: number; label: string; max: number }
  self: {
    position: { x: number; y: number; z: number }
    health: number
    food: number
    held_item: string | null
    inventory: Array<{ name: string; count: number }>
  }
  thought?: string
  action?: unknown
  outcome?: { ok: boolean; message: string }
  curator?: { pass: string[]; remove: string[] }
  verbs?: string[]
  recentHistory: string[]
  viewer?: { thirdPerson?: string; firstPerson?: string }
}

export interface ObserverOptions {
  agentId: string
  port: number
  /** Optional run dir — writes state.json each update for tail/file watchers. */
  runDir?: string
  viewer?: { thirdPerson?: string; firstPerson?: string }
}

/** Live HUD server: inventory, held item, tick phase, last thought/action. */
export class ObserverDashboard {
  private state: ObserverSnapshot
  private server: Server | null = null
  private clients = new Set<(data: string) => void>()

  constructor(private readonly opts: ObserverOptions) {
    this.state = {
      agentId: opts.agentId,
      tick: 0,
      phase: 'idle',
      updatedAt: new Date().toISOString(),
      milestone: { score: 0, label: 'start', max: 11 },
      self: {
        position: { x: 0, y: 0, z: 0 },
        health: 20,
        food: 20,
        held_item: null,
        inventory: [],
      },
      recentHistory: [],
      viewer: opts.viewer,
    }
  }

  get url(): string | undefined {
    return this.server ? `http://localhost:${this.opts.port}` : undefined
  }

  async start(): Promise<void> {
    if (!(await isPortFree(this.opts.port))) {
      logger.warn(
        { port: this.opts.port },
        'observer port already in use — skipping dashboard (kill stale process or set OBSERVER_ENABLED=false)'
      )
      return
    }

    this.server = createServer((req, res) => {
      const path = req.url?.split('?')[0] ?? '/'
      if (path === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(this.state))
        return
      }
      if (path === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        const send = (data: string): void => {
          res.write(`data: ${data}\n\n`)
        }
        send(JSON.stringify(this.state))
        this.clients.add(send)
        req.on('close', () => this.clients.delete(send))
        return
      }
      if (path === '/' || path === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderPage(this.opts.viewer))
        return
      }
      res.writeHead(404)
      res.end('not found')
    })

    await new Promise<void>((resolve) => this.server!.listen(this.opts.port, '0.0.0.0', resolve))
    logger.info({ url: this.url }, 'observer dashboard started — open this URL (not :3020)')
  }

  close(): void {
    for (const send of this.clients) {
      try {
        send('[DONE]')
      } catch {
        /* client gone */
      }
    }
    this.clients.clear()
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  /** Merge partial update and broadcast to connected browsers. */
  publish(partial: Partial<ObserverSnapshot>): void {
    this.state = {
      ...this.state,
      ...partial,
      self: partial.self ? { ...this.state.self, ...partial.self } : this.state.self,
      milestone: partial.milestone ? { ...partial.milestone } : this.state.milestone,
      updatedAt: new Date().toISOString(),
    }
    const json = JSON.stringify(this.state)
    for (const send of this.clients) {
      try {
        send(json)
      } catch {
        this.clients.delete(send)
      }
    }
    if (this.opts.runDir) {
      try {
        writeFileSync(join(this.opts.runDir, 'state.json'), JSON.stringify(this.state, null, 2))
      } catch {
        /* best effort */
      }
    }
  }

  setPhase(phase: ObserverPhase, phaseDetail?: string): void {
    this.publish({ phase, ...(phaseDetail !== undefined ? { phaseDetail } : {}) })
  }
}

function renderPage(viewer?: { thirdPerson?: string; firstPerson?: string }): string {
  const third = viewer?.thirdPerson ?? 'http://localhost:3020'
  const first = viewer?.firstPerson ?? 'http://localhost:3021'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Dimitri observer</title>
<style>
  :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1115; color: #e6e6e6; min-height: 100vh; }
  .banner { background: #1a3a2a; border-bottom: 1px solid #3fb950; padding: 10px 14px; }
  .banner strong { color: #3fb950; }
  .banner a { color: #7ec8ff; }
  header { padding: 10px 14px; background: #1a1d24; border-bottom: 1px solid #2a2f3a; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 15px; font-weight: 600; }
  .pill { padding: 3px 10px; border-radius: 999px; font-size: 12px; background: #252a34; }
  .pill.live { background: #1e3a5f; color: #7ec8ff; }
  .pill.active { background: #1e3a5f; color: #7ec8ff; }
  .pill.acting { background: #3d2a00; color: #ffc857; animation: pulse 1.2s ease-in-out infinite; }
  .pill.err { background: #5a1a1a; color: #ff8a8a; }
  @keyframes pulse { 50% { opacity: 0.65; } }
  main { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 0; min-height: calc(100vh - 90px); }
  aside { overflow: auto; padding: 12px 14px; border-right: 1px solid #2a2f3a; }
  .view-panel { padding: 12px 14px; background: #141820; }
  section { margin-bottom: 16px; }
  section h2 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #8b949e; }
  .milestone { font-size: 14px; font-weight: 600; }
  .bar { height: 8px; background: #252a34; border-radius: 4px; margin-top: 6px; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: #3fb950; transition: width 0.3s; }
  .inv { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; }
  .held { color: #ffc857; font-weight: 600; font-size: 14px; }
  .hint { color: #8b949e; font-size: 11px; margin-top: 4px; }
  .thought, .action, .outcome { white-space: pre-wrap; word-break: break-word; background: #0f1115; padding: 10px; border-radius: 6px; border: 1px solid #2a2f3a; font-size: 12px; }
  .outcome.ok { border-color: #238636; }
  .outcome.fail { border-color: #da3633; }
  .history { max-height: 180px; overflow: auto; font-size: 11px; line-height: 1.5; opacity: 0.9; }
  .verbs { display: flex; flex-wrap: wrap; gap: 4px; }
  .verbs span { background: #252a34; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .view-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .view-btns a { display: inline-block; padding: 10px 16px; background: #252a34; color: #fff; text-decoration: none; border-radius: 6px; border: 1px solid #3a4150; }
  .view-btns a:hover { background: #2f3644; border-color: #7ec8ff; }
  .view-note { color: #8b949e; font-size: 12px; line-height: 1.5; max-width: 520px; }
  #status { margin-left: auto; font-size: 11px; color: #8b949e; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid #2a2f3a; } }
</style>
</head>
<body>
<div class="banner">
  You are on the <strong>observer HUD</strong> (:3022).
  For 3D world view open <a href="${third}" target="_blank" rel="noopener">3rd person (:3020)</a>
  or <a href="${first}" target="_blank" rel="noopener">1st person (:3021)</a> in a <strong>new tab</strong> — embedded view often stays black.
</div>
<header>
  <h1 id="agent">dimitri</h1>
  <span class="pill" id="tick">tick —</span>
  <span class="pill" id="phase">connecting…</span>
  <span class="pill" id="pos">—</span>
  <span class="pill" id="vitals">—</span>
  <span id="status">polling…</span>
</header>
<main>
  <aside id="panel"><p class="hint">Loading state…</p></aside>
  <div class="view-panel">
    <section>
      <h2>3D world view</h2>
      <div class="view-btns">
        <a href="${third}" target="_blank" rel="noopener">Open 3rd person ↗</a>
        <a href="${first}" target="_blank" rel="noopener">Open 1st person ↗</a>
      </div>
      <p class="view-note">prismarine-viewer has no inventory HUD and shows dropped items as pink squares. This panel on the left is the reliable way to watch what Dimitri is doing.</p>
    </section>
  </div>
</main>
<script>
function fmtInv(items, history) {
  if (!items.length) {
    const mining = (history || []).some(h => h.includes('mined '));
    if (mining) return '<div class="muted">empty</div><div class="hint">Mined blocks drop items on the ground — Dimitri has not picked them up yet.</div>';
    return '<div class="muted">empty</div>';
  }
  return items.map(i => '<div>' + i.name + '</div><div>×' + i.count + '</div>').join('');
}
function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function render(s) {
  if (!s || !s.self || !s.self.position || !s.milestone) throw new Error('incomplete state');
  document.getElementById('agent').textContent = s.agentId || 'dimitri';
  document.getElementById('tick').textContent = 'tick ' + s.tick;
  const phaseEl = document.getElementById('phase');
  phaseEl.textContent = s.phaseDetail ? s.phase + ': ' + s.phaseDetail : (s.phase || 'idle');
  phaseEl.className = 'pill live' +
    (s.phase === 'acting' || s.phase === 'curating' || s.phase === 'deciding' ? ' active' : '') +
    (s.phase === 'acting' ? ' acting' : '');
  document.getElementById('pos').textContent =
    s.self.position.x.toFixed(1) + ', ' + s.self.position.y.toFixed(1) + ', ' + s.self.position.z.toFixed(1);
  document.getElementById('vitals').textContent = 'hp ' + s.self.health + '/20  food ' + s.self.food + '/20';
  document.getElementById('status').textContent = 'live · ' + (s.updatedAt || '');
  const pct = Math.round((s.milestone.score / s.milestone.max) * 100);
  document.getElementById('panel').innerHTML =
    '<section><h2>Progress</h2><div class="milestone">' + s.milestone.score + '/' + s.milestone.max + ' — ' + esc(s.milestone.label) + '</div><div class="bar"><span style="width:' + pct + '%"></span></div></section>' +
    '<section><h2>Held item</h2><div class="held">' + esc(s.self.held_item || '(nothing)') + '</div></section>' +
    '<section><h2>Inventory</h2><div class="inv">' + fmtInv(s.self.inventory || [], s.recentHistory) + '</div></section>' +
    (s.verbs && s.verbs.length ? '<section><h2>Verbs in play</h2><div class="verbs">' + s.verbs.map(v => '<span>' + esc(v) + '</span>').join('') + '</div></section>' : '') +
    (s.thought ? '<section><h2>Thought</h2><div class="thought">' + esc(s.thought) + '</div></section>' : '') +
    (s.action ? '<section><h2>Action</h2><div class="action">' + esc(JSON.stringify(s.action, null, 2)) + '</div></section>' : '') +
    (s.outcome ? '<section><h2>Outcome</h2><div class="outcome ' + (s.outcome.ok ? 'ok' : 'fail') + '">' + esc(s.outcome.message) + '</div></section>' : '') +
    (s.recentHistory && s.recentHistory.length ? '<section><h2>Recent history</h2><div class="history">' + s.recentHistory.map(esc).join('<br/>') + '</div></section>' : '');
}
function onErr(msg) {
  document.getElementById('status').textContent = msg;
  document.getElementById('phase').className = 'pill err';
  document.getElementById('phase').textContent = 'disconnected';
}
async function poll() {
  try {
    const r = await fetch('/state', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    render(await r.json());
  } catch (e) {
    onErr('cannot reach Dimitri — is pnpm dimitri running?');
  }
}
poll();
setInterval(poll, 1500);
try {
  const es = new EventSource('/events');
  es.onmessage = (e) => { if (e.data !== '[DONE]') { try { render(JSON.parse(e.data)); } catch (_) {} } };
  es.onerror = () => { /* polling is the fallback */ };
} catch (_) {}
</script>
</body>
</html>`
}
