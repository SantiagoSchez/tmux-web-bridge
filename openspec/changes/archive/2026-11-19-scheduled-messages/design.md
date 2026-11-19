# Design

## Context

See proposal.md for the motivation. Automations (`server/src/automations.ts`) already launch a prompt on their own: a store in `dataDir/automations.json`, a 20-second timer, and a `launch` dependency that `server/src/index.ts` implements with `launchTask(host, machineFolders(host), req)` followed by `host.refresh()`. Its `'run'` event feeds the activity list and, on error, a push. The panel edits them from Settings › Automatizaciones with `AutomationForm` (`web/src/components/Automations.tsx`): name, machine, folder (from `/api/targets`), prompt, new worktree with `BaseBranchSelect`, skip permissions.

The limits each machine's Claude account has left reach the panel two ways, both read by `rows()` in `web/src/components/LimitsBar.tsx`: the hub's reading per account (`accounts` signal, `acc.activeOn` listing the machines on it) and the statusline's `RateLimits`. `rows()` keeps the freshest of the two per account.

## Goals / Non-Goals

**Goals:**

- One-off messages with the launch options of an automation, a fixed time, and a result kept 7 days.
- The same launch path as automations, so a scheduled message opens its window exactly as an automation run does.
- Times suggested from the account limits the panel already reads, with no new hub reading.

**Non-Goals:**

- Folding scheduled messages into `Automations` as a «once» schedule kind (see D1).
- Any change to automations' behaviour; only their form's launch fields move to a shared component.

## Decisions

### D1. A store and scheduler of their own, `ScheduledMessages`, in `server/src/scheduled.ts`

**Context:** a scheduled message looks like an automation with a single run, but its lifecycle differs: it launches late after a stop, it is never skipped because a previous run is busy, it can only be edited while pending, and it disappears 7 days after it ran.
**Decision:** a new `ScheduledMessages` class (an `EventEmitter`, like `Automations`) that keeps `dataDir/scheduled.json` (`{ list: ScheduledMessage[] }`, written to a `.tmp` and renamed, mode 0600) and checks its messages every 20 seconds. Its dependencies:

- `launch(m, req): Promise<ExtLaunchResult>`, the same shape as automations'.
- `check(host, target): string | null`: why a machine or folder is not valid (the machine is not in the panel, the folder is not among its saved folders by `path`).
- `now?: () => Date` for the tests.

Events: `'change'` (`ScheduledMessage[]`) after every save, and `'run'` (`ScheduledMessage`) after each launch or error.
**Alternatives:** a `{ kind: 'once', at }` schedule in `Automations`; rejected because every rule above would need its own case inside the automation code (no catch-up, no busy check, edit lock, pruning, launch state saved before launching).
**Consequences:** new wiring in `index.ts`: the tasks include a boot smoke test.

### D2. The data model

`shared/types.ts` gains:

```ts
/** A prompt the hub launches once, at `at` (the right panel's «Programados»). */
export interface ScheduledMessage {
  id: string;
  name: string;
  host: string;
  target: { folder: string; sub?: string };
  prompt: string;
  worktree: boolean;
  base?: string;
  skipPermissions: boolean;
  /** When it launches, epoch milliseconds. */
  at: number;
  /** pending; launching: the hub started launching it; launched; error. */
  status: 'pending' | 'launching' | 'launched' | 'error';
  /** launched or error: when it ran, epoch milliseconds. */
  ranAt?: number;
  /** It launched after its time, because the hub was stopped at `at`. */
  late?: boolean;
  message?: string;
  session?: string;
  window?: string;
  pane?: string;
  worktreeName?: string;
}

/** POST /api/scheduled: a new one (no id), or a change to a pending one. */
export type ScheduledMessageInput = Pick<ScheduledMessage, 'name' | 'host' | 'target' | 'prompt' | 'worktree' | 'base' | 'skipPermissions' | 'at'> & { id?: string };
```

`ServerMessage` gains `{ t: 'scheduled'; list: ScheduledMessage[] }`. `ActivityEvent.source` gains `'scheduled'`, and its doc comment says that a scheduled message's error is shown like an automation's (`windowName` is the message's name).

### D3. Validation in `shared/scheduled.ts`

**Decision:** `parseScheduled(raw, now)` returns the message as kept (unknown keys dropped, the name cleaned, the base only with a worktree) or a Spanish message saying why it is not one; `scheduledProblem(raw, now)` returns only that message or null. The form checks with it before sending and the hub parses with it on save:

- `name` required after trimming control characters, at most 60 characters («Falta el nombre»).
- `host` and `target.folder` present («Falta la máquina», «Falta la carpeta»).
- `prompt` required, at most 10,000 characters.
- `at` a finite number later than `now` («Esa hora ya ha pasado»).
- With `worktree`, the run's worktree name valid (`worktreeNameProblem(runWorktreeName(name, at))`) and the base branch valid (`branchNameProblem`).

The hub also refuses: a machine or folder `check` rejects («No existe la máquina …», «Esa carpeta no está entre las de …»), more than 50 messages («Como mucho 50 mensajes programados»), an id that does not exist («Ese mensaje programado ya no existe»), an edit of one that already ran («Ese mensaje ya se ha lanzado»), and an edit or removal of one being launched («Ese mensaje se está lanzando»). The store throws a `ScheduledError` carrying the status the route answers: 404 for an unknown id, 409 for a message that already ran or is being launched, 400 for the rest.

### D4. The lifecycle: launch once, late after a stop, never twice

**Decision:** each tick, in order:

1. Results whose `ranAt` is more than 7 days old leave the list (one save if any left).
2. Each pending message with `at <= now` is set to `launching` and saved **before** `launch` is called. It is launched with `{ target, prompt, name: worktreeName ?? name, worktree, base, skipPermissions }`, where `worktreeName = runWorktreeName(name, new Date(at))`, so the worktree's name carries the planned time, as the spec's example shows. It then becomes `launched` with `ranAt`, `session`, `window`, `pane`, or `error` with `ranAt` and the message.
3. A message whose launch started more than one tick after its `at` (the hub was stopped) is marked `late: true`. The threshold is `at + 60 s`, longer than a tick, so a message launched on the tick after its time is never called late.

The launches of one tick run one after another, and a tick does not start while the previous one is running (a `ticking` flag), so a slow launch is never started twice. Each due message is read again before its launch, so one moved or cancelled while an earlier one was launching is not launched with its old fields. When the store loads, every message found `launching` becomes `error` with «El hub se reinició mientras lo lanzaba» and `ranAt` = now, and is not launched again. `start()` does not tick right away: the first tick comes one interval (20 s) later, when the machines have had their first poll, so a missed message does not fail only because its machine was still connecting. A missed message therefore launches within 20 seconds of the hub starting.

**Alternatives:** relaunching a message found `launching`; rejected, since the window may already be open and a duplicate task spends the limit twice.

### D5. Wiring in `server/src/index.ts`

**Decision:**

- The launch helper of automations becomes a function, `launchOnHost(hostId, req)`, used by both: it throws «No existe la máquina …» or «… no está conectada», launches with `launchTask` and refreshes the host.
- `scheduled = new ScheduledMessages(config.dataDir, { launch, check })`. `check` uses `hosts.get(host)` and `settings.value.folders[host]`.
- `scheduled.start()` is called next to `automations.start()`; its first tick waits one interval (D4).
- `scheduled.on('change', list => broadcast({ t: 'scheduled', list }))`, and the `/ws` snapshot sends `{ t: 'scheduled', list: scheduled.list }`.
- `scheduled.on('run')`: a launch adds `{ kind: 'launch', source: 'scheduled', … , text: m.name }` to the activity; an error adds `{ kind: 'error', source: 'scheduled', windowName: m.name, text: m.message }` and sends `push.send({ title: '⚠️ ' + m.name, body: 'El mensaje programado no se ha podido lanzar: …', tag: 'scheduled:' + m.id, url: '/' })`, which the quiet schedule's gate in `PushService` already holds back.
- Routes: `GET /api/scheduled` (the list), `POST /api/scheduled` (create or edit; 400 with the message, 409 when not pending), `POST /api/scheduled/:id/delete` (cancel a pending one or remove a result; 409 while `launching`, 404 for an unknown id).
- Removing a machine from the panel leaves its messages; they fail at their time with the machine's error, as the spec asks.

### D6. Suggested times in `shared/scheduled.ts`

**Decision:** `limitSuggestions(now, fiveHourReset, weeklyReset)` (epoch ms, each may be null) returns `{ label, at }[]` in this order: «1 día antes del reinicio semanal», «12 h antes del reinicio semanal», «3 h antes del reinicio semanal», «Cuando se reinicie el límite de 5 h», keeping only those later than `now`, with each time rounded down to the minute so it fits a `datetime-local` field. It is pure and tested with the server's tests, as `quiet-hours.ts` is.

The panel finds the resets with `machineLimits(hostId)`, exported from `LimitsBar.tsx` next to `rows()`, which it reuses: it returns the 5-hour and weekly windows of the only row whose `acc.activeOn` lists the machine, the same test `currentRow()` uses. With no such row (no account known, or two that claim the machine), it returns nothing and the form shows no chip.

### D7. The panel

**Decision:**

- **Sidebar button.** `Tree.tsx` adds an icon button (a new `IconScheduled`, a clock with a plus, in `icons.tsx`) next to the machine's «Nuevo espacio» in both header variants (several machines and a single one), titled «Programar mensaje». It opens the form with that machine.
- **Form.** `ScheduledDialog` in a new `web/src/components/Scheduled.tsx`, opened as a new `Dialog` kind, `{ kind: 'scheduled'; host: string; message?: ScheduledMessage }` (`state.ts`), that `Dialogs.tsx` renders like the others. The launch fields move from `AutomationForm` to `web/src/components/LaunchFields.tsx`, which both forms use: `useLaunchFields` holds their state, the folder choices from `/api/targets` and the value to save; `LaunchTargetFields` draws name, machine, folder and prompt; `LaunchOptionFields` draws new worktree, base branch and skip permissions. Each form puts its «when» between the two. In this one, a `datetime-local` field and the suggestion chips; tapping a chip fills the field. The form validates with `scheduledProblem` before sending and shows the hub's refusal when there is one. Editing opens the same form with the message's values.
- **«Programados» section.** `ScheduledList` at the top of `Scratchpads()` (`web/src/components/Scratchpads.tsx`), rendered only when `scheduled.value.length > 0`, with a header «Programados (n)» that folds it (a new pref `scheduledFolded`, kept in `prefs.ts` like the panel's other folds). Each row shows the name, when it launches (or launched, with «tarde» when `late`), the machine and the folder. A pending row has «Editar» and «Cancelar». A launched row has «Ir a la ventana» while its pane exists in the tree, and «Quitar». An error row shows the message and «Quitar». Ordered: pending by time, then results newest first.
- **State.** A `scheduled` signal in `state.ts`, set by `ws.ts` on `{ t: 'scheduled' }`. The buttons call the REST routes with the existing `api` helper; the list updates from the broadcast.
- **Activity.** `Activity.tsx` gets the `scheduled` source in `SOURCE` («mensaje programado») and its error text, as it has for automations.

**Consequences:** styles in `styles.css` for the section, the rows and the chips; the section has to fit the right panel at phone width.
