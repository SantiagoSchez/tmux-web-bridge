# server standards

The conventions of the `server` layer (server/**, shared/**). The principles in [base-standards.md](base-standards.md) apply first; this document adds what is specific to this layer. Keep it short and concrete: a rule here is something a reviewer can check.

## Stack

- TypeScript (`typescript ^7.0.2`), strict, ESM (`"type": "module"`, `module`/`moduleResolution` `NodeNext`, `verbatimModuleSyntax`, `isolatedModules`). `server/tsconfig.json` also typechecks `../shared`.
- Node.js 22 (`esbuild --target=node22`, `node:22-bookworm-slim` in the `Dockerfile`), pnpm 10 workspace (`packageManager: pnpm@10.19.0`).
- HTTP and WebSocket: `fastify ^5.12.7`, `@fastify/websocket ^11.3.4`, `@fastify/static ^10.1.6` (serves `web/dist`).
- Terminals: `node-pty ^1.1.0` running a tmux client, locally or through `ssh` (OpenSSH with ControlMaster, no SSH library).
- Others: `web-push ^3.6.7` (Web Push), `yaml ^2.9.1` (`config.yaml`), `qrcode ^1.5.4` (2FA), `sherpa-onnx-node 2.0.1` pinned exactly (dictation; its types live in `server/src/sherpa-onnx-node.d.ts`).
- Dev and build: `tsx ^4.23.15` (`tsx watch` in dev, `tsx --test` for tests), `esbuild ^0.28.2` bundles `src/index.ts` to `dist/index.js` with `--packages=external`.
- No HTTP client library: outbound calls use the global `fetch`.

## Structure

- `server/src/` is flat: one module per feature, lower-case, kebab-case for two words (`account-store.ts`, `host-creds.ts`, `claude-oauth.ts`). No subfolders.
- `server/src/index.ts` is the composition root: it loads the config, instantiates every store and service, wires their events to websocket broadcasts, and declares every Fastify route and both websocket endpoints (`/ws`, `/ws/term`), grouped under `// ----… section` banner comments. Feature logic lives in the modules, not in the route handlers.
- Core modules: `config.ts` (`config.yaml` → `Config`), `exec.ts` (`TmuxExec`: every tmux, SSH and remote-shell call), `host.ts` (`HostMonitor`: polls one machine's tmux tree), `actions.ts` (`runAction`: the tree actions of `ActionOp`), `terminal.ts` (pty per browser terminal), `machines.ts` (`MachineStore`, `dataDir/hosts.json`), `settings.ts` (`SettingsStore`, `dataDir/settings.json`).
- `server/src/kit.ts` (installing and updating the host kit over SSH) also belongs to the host-kit layer: see [host-kit-standards.md](host-kit-standards.md).
- `shared/` is plain TypeScript with no dependencies and no Node or DOM APIs, imported by `server`, `web` and `trello-extension`. `shared/types.ts` is type-only (imported with `import type`); the other files (`folders.ts`, `keybar.ts`, `copy.ts`, `paths.ts`, `worktree.ts`…) hold pure logic both sides run: validation, sanitising, parsing.
- Persistent state is one JSON file per store in `config.dataDir` (`hosts.json`, `settings.json`, `automations.json`, `activity.json`, `sessions.json`, `ext-token.json`…). `config.yaml` (path from `TMUX_WEB_CONFIG`, documented in `config.example.yaml`) holds only deployment settings; what the panel edits lives in `dataDir`.
- Tests sit next to the code as `server/src/<module>.test.ts`; tests of `shared/` modules live there too (`keybar.test.ts`, `copy.test.ts`, `typing.test.ts`, `shortcut.test.ts`).

## Conventions

- Code, identifiers and comments are in English. Every string a person reads is in Spanish (es-ES, `tú`): thrown error messages, HTTP `error` bodies, log lines, push texts. UI names are quoted with «» in both strings and comments (`«Nuevo espacio»`, `Ajustes › Máquinas`).
- Every contract between hub and browser is a type in `shared/types.ts`: REST bodies and results (`MachinesInfo`, `ExtLaunchRequest`…), the websocket unions `ClientMessage` and `ServerMessage` (discriminated by `t`) and the tree actions `ActionOp` (discriminated by `op`). A change to one updates the server and every consumer (`web`, and `trello-extension` for the `Ext*` types) in the same commit.
- Imports of `shared/` and of sibling modules from `server/` carry the `.js` extension (`'../../shared/types.js'`, `'./exec.js'`); type-only imports use `import type`.
- Tree actions go over the app websocket as `{ t: 'action', id, host, ...ActionOp }` and are answered with `{ t: 'result', id, ok, data | error, code? }`. Hub state every device shows (tree, settings, machines, accounts, activity…) is pushed with `broadcast()` and also sent in the initial snapshot of the `/ws` handler. Everything else is REST under `/api/*`.
- REST handlers read `req.body` / `req.query` as `Partial<…>` or `unknown` and narrow every field before use (`typeof`, regexes, `checkMachine`, `sanitize*`). Errors answer `reply.code(n).send({ error: '<Spanish message>' })`: 400 bad input, 404 gone, 409 wrong state, 502 the machine failed. Trello routes add `setup: true` when the fix is in Ajustes › Trello.
- Authentication is centralised in the `onRequest` hook: a new route is covered without extra code. POSTs and websocket upgrades must come from the app's own origin; `/api/ext/*` only takes the extension's bearer token; `/api/notify` only `notifyToken`. Only the routes in `PUBLIC_API` skip the password session.
- tmux ids received from a client are checked against `^\$\d+$` (session), `^@\d+$` (window) and `^%\d+$` (pane) before they reach a tmux command (`check()` in `actions.ts`, inline regexes in `index.ts` and `terminal.ts`).
- tmux runs through `host.exec.run([...args])` / `runFormat([...])` with an argument array; `TmuxExec` quotes each argument with `shq()` for the remote shell and adds the socket args (`-L`/`-S`) of the machine. Multi-command calls use `';'` as a separate argument.
- Shell scripts run on a machine through `host.exec.shell(script, timeoutMs?, stdin?)` (or `spawnShell` for streaming). Every interpolated value is quoted (`shq()` from `exec.ts`, or the `'…'`-escaping helpers for paths under `~` that write `"$HOME"/…`); untrusted text goes through stdin, not the script. Script output is parsed as tab-separated lines with a one-letter tag (`H\t…`, `F\t…`, `C\t…`).
- tmux `-F` formats split fields with control characters (`\x1f`) and are read with `runFormat()`, which undoes tmux 3.5's octal escapes.
- Every external process and request has a timeout: `execFile(..., { timeout })`, `exec.run(args, timeoutMs)` (10 s by default), `fetch(..., { signal: AbortSignal.timeout(ms) })`.
- Local tmux processes never inherit the hub's own tmux client: `exec.ts` removes `TMUX` and `TMUX_PANE` from their environment.
- Stores are classes constructed with `dataDir` that load their JSON in the constructor (falling back to defaults when it is unreadable; `MachineStore` throws instead, so a broken `hosts.json` never starts an empty hub), validate on load and on update, save on every change, and extend `EventEmitter` when others react to them; the events are listed in the class JSDoc (`Events: 'change' (HubSettings).`). Stores holding secrets write with `mode: 0o600`, most through a temporary file and `renameSync`.
- Stores and services never broadcast to the browsers themselves: they emit events, and `index.ts` turns them into `ServerMessage` broadcasts. Only `terminal.ts` and `heartbeat.ts` handle sockets directly.
- Logging is `console.log` / `console.warn` / `console.error` with a bracketed area tag and a Spanish message: `` console.log(`[máquinas] añadida ${m.id}`) ``. Fastify's logger stays at `warn` (`LOG_LEVEL`). Secrets (tokens, passwords) are never logged (to confirm).
- Errors are plain `Error`s with a Spanish message meant for the panel, or a small subclass when a caller branches on them (`TmuxError` with `noServer`/`transport`, `FileError` with `status`, `TrelloSetupError`, `NeedsLoginError` with `code`). Catch blocks read `(err as Error).message`.
- Fire-and-forget promises are marked with `void` (`void host.refresh()`).
- Exported functions and classes have a JSDoc comment saying what they are for and why; a module that holds a feature opens with a `//` paragraph describing it.
- No formatter or linter is configured: match the surrounding style (2-space indent, single quotes, semicolons, trailing commas, long single lines).

## Forbidden patterns

- Building a tmux command as one shell string: pass an argument array to `host.exec.run()`.
- Calling `tmux` or `ssh` with `child_process` outside `exec.ts`: go through `TmuxExec` (`run`, `runFormat`, `shell`, `spawnShell`, `spawnable`), which adds the SSH options, `PATH`, socket args and quoting.
- Interpolating an unquoted value into a remote shell script, or a client value into a tmux target without its id regex: quote with `shq()` and validate ids first.
- Declaring a hub–browser payload or message type locally in `server/` or `web/`: put it in `shared/types.ts`. (The terminal socket's `TermInput` in `terminal.ts` is the existing exception: only `TerminalView` speaks it.)
- Node, DOM or package imports in `shared/`: it is compiled by three targets; keep it to plain TypeScript.
- A runtime import from `shared/types.ts`: it is type-only, use `import type`.
- Writing hub state edited in the panel into `config.yaml`: it belongs in a store under `dataDir` (`config.yaml` may be mounted read-only in Docker).
- Trusting a request body's shape or keeping unknown keys: narrow each field and drop the rest, as `SettingsStore.update()` does.
- A request, process or SSH call without a timeout.
- English text in an error, response or log line a person reads, or Spanish in code identifiers and comments.

## Testing

- The levels this layer tests at and where each kind of test lives, following [testing-standards.md](testing-standards.md).
- The test, typecheck and lint commands are configured in `.claude/koalarnes.json` and listed in step 4 of [the mandatory task steps](../../.claude/rules/koalarnes-mandatory-steps.md); never copy them here, where they would go stale.
- Tests use `node:test` (`test(...)`) and `node:assert/strict`, run by `tsx`, one file per module in `server/src/<module>.test.ts`. Test names are English sentences stating the behaviour; assertions match the Spanish messages (`/No existe la carpeta/`).
- Pure logic (parsers, sanitisers, `shared/` helpers, schedules) is unit-tested without mocks.
- Remote shell scripts are tested by running them for real with `/bin/sh` against a temporary `HOME` (`mkdtempSync(join(tmpdir(), 'twb-…'))`, removed in `finally`), through a fake host that implements only the `exec` methods the code uses (see `fakeHost` in `actions.test.ts` and `temp.test.ts`).
- tmux is not started by the unit tests: the fake host records the tmux argument arrays and the test asserts them, a deliberate pin of the command line.
- A test (or a hub started for a manual or end-to-end check with a `local` machine) that does start tmux must be isolated: unset `TMUX` and `TMUX_PANE`, give it its own `TMUX_TMPDIR`, and use its own socket (`-L`/`-S`). A bare `tmux` reaches the user's real server.
- Tests that run `git` pass an explicit environment (`{ PATH, HOME }`), which drops every inherited `GIT_*` variable.
- Third-party HTTP is faked at the `fetch` boundary by injecting it (`new TrelloService(dir, fakeFetch)`), and the fake answers like the real API.
- Stores are tested against a temporary `dataDir`, including reloading a new instance from the saved file.
- Route handlers in `index.ts` have no tests; the behaviour behind a route is tested in its module. A route test, if added, starts the app on a loopback port the test picks (see [testing-standards.md](testing-standards.md)).
- `pnpm typecheck` and `pnpm test` pass before every push: the deploy workflow on `master` runs neither.

## Common workflows

- **A new tree action (tmux)**: `shared/types.ts` (a variant of `ActionOp`), `server/src/actions.ts` (a `case` in `runAction`, ids checked, and `READ_ONLY_OPS` if it only reads), `server/src/actions.test.ts`, and the caller in `web` (`hub.action(host.id, { op: … })`, usually from `web/src/menus.ts` or a component).
- **A new REST endpoint**: the logic in `server/src/<feature>.ts` with `server/src/<feature>.test.ts`, the route in `server/src/index.ts` under its section banner, the body and result types in `shared/types.ts`, and the caller in `web/src/components/<Feature>.tsx` (its local `api<T>()` helper).
- **A new hub setting** (the same for every device): `shared/types.ts` (a documented field of `HubSettings`), `server/src/settings.ts` (`DEFAULTS`, its validation in `update()`, and in the constructor if it needs sanitising on load), `server/src/settings.test.ts`, `server/src/index.ts` (in `settings.on('change')` if the hub reacts to it), and the control in `web/src/components/Settings.tsx` or its section component, writing with `hub.send({ t: 'settings', settings: { … } })`.
- **New hub state pushed to every browser**: the store or service emitting `'change'`, a `ServerMessage` variant in `shared/types.ts`, the `broadcast()` and the initial `send()` in the `/ws` handler of `server/src/index.ts`, a signal in `web/src/state.ts` and its `case` in `web/src/ws.ts`.
- **A new persisted store**: `server/src/<name>.ts` (a class taking `dataDir`, `dataDir/<name>.json`, temp file + rename and `0o600` if it holds secrets), its test, and its instantiation and event wiring in `server/src/index.ts`.
- **A new `config.yaml` option**: `server/src/config.ts` (the `Config` field with its JSDoc and its parsing with a default in `loadConfig`) and `config.example.yaml` (commented); `README.md` if a person installing the hub has to know it.
- **A change to an `Ext*` type or `/api/ext/*`**: `shared/types.ts`, `server/src/ext.ts` or `server/src/index.ts`, and `trello-extension/` in the same commit; the extension is rebuilt by hand.
