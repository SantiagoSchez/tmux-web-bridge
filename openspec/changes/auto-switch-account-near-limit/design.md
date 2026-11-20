# Design

## Context

See proposal.md for the motivation and specs/account-auto-switch/spec.md for the behaviour.

What already exists and this change reuses:

- `AccountManager` (`server/src/accounts.ts`) reads each account's usage from Anthropic every 5 minutes (`pollDue`, `USAGE_EVERY`), emits `'change'` with `AccountsInfo`, and switches a machine with `switchHost(hostId, accId)`, which runs in its `serial` queue, takes a spare login (`AccountStore.spareLogin`, `NeedsLoginError` when none), confirms its owner and writes it to the machine. `AccountsInfo` already carries, per account, `usage`, `usageError`, `activeOn`, `spare` and `needsLogin`, and per machine its account (`hosts`) and the machines being switched (`switching`).
- `checkLimits` (`server/src/limits-check.ts`) separates each machine's statusline readings (`RateLimits`, keyed by email) into kept and foreign ones. `index.ts` runs it on every machine and account change.
- `SettingsStore` (`server/src/settings.ts`) validates every `HubSettings` patch field by field and drops a machine's per-machine entries in `forgetHost`.
- `ActivityLog.add` (`server/src/activity.ts`) records an `ActivityEvent` and `index.ts` broadcasts it; `PushService.send` (`server/src/push.ts`) drops a push inside the quiet hours.

Constraint from `claude-accounts`: a refresh token works once, so a login goes to one machine only; a target account needs a spare login.

## Goals / Non-Goals

**Goals:**

- The whole decision (usage, candidates, target, warnings, back-and-forth guard) is one pure function in `shared/`, tested without mocks.
- The service around it only gathers inputs, calls `switchHost`, and reports.

**Non-Goals:**

- No new reading of Anthropic's usage, and no change to how `switchHost` writes a machine.
- No REST endpoint: everything goes over the existing websocket messages.

## Flow

```
AccountManager ──'change'(AccountsInfo)──┐
HostMonitor ──'change'(statusline)───────┤  index.ts
                                         ▼
                     AccountRotation.evaluate()     (one round at a time; a call while one runs
                         │                            joins it)
                         │  inputs: settings.accountRotation, accounts.info,
                         │          checkLimits(...).kept, host statuses, its own memory
                         ▼
                 decideRotation(...)  (shared/rotation.ts, pure)
                         │  → per machine: switch to X | warn no target | nothing
                         ▼
     accounts.switchHost(host, X)  ── one machine at a time, re-deciding after each switch
                         │
           ok ───────────┼──────────── error
            ▼                            ▼
   activity.add(kind 'account')   activity.add(kind 'account', error) once
   push.send(tag account:<host>)  push.send once
                         │
         ActivityLog 'add' → broadcast { t: 'activityAdd' } → web «Actividad»
```

Settings go the usual way: Ajustes › Máquinas → `hub.send({ t: 'settings', settings: { accountRotation } })` → `SettingsStore.update` → `'change'` → broadcast `{ t: 'settings' }`.

## Decisions

### D1. The decision is a pure function in `shared/rotation.ts`

**Context:** The rules (thresholds, preference for free accounts, the 10-point fallback, the back-and-forth guard, one warning per window) have many cases, and the testing standards ask for pure logic tested without mocks.

**Decision:** `shared/rotation.ts` exports the types and two functions: `rotationAccounts(list, readings, now)`, which gives each account its usage by merging the hub's reading and the kept statusline readings under the account's email into `{ five, seven, fiveReset, sevenReset }` (the freshest reading wins; a window whose reset has passed is 0 %), and `decideRotation(input)`, which takes the settings, the accounts with their usage, the machines (id, account, switch on, connected, being switched) and the service's memory, and the time, and returns, for the first machine not in `skip` (and not waiting to retry a failed switch, D4) that needs something, what to do: `{ host, kind: 'switch', from, to, limit, pct, window, fallback }` (with `targetWindow`, the limit the target passed and its window, when the target is itself over a threshold), `{ host, kind: 'stuck', from, limit, pct, window }` (no target, not warned yet in this window), `{ host, kind: 'offline', from, to, limit, pct, window }` (D7, not reported yet in this window), or nothing. A window is named `account:limit:reset` (the account whose limit it is), with the reset rounded to Anthropic's grid (10 minutes for 5 hours, 1 hour for 7 days): the hub's reading and a statusline's of one window may carry resets a few seconds apart (`limits-check.ts` tolerates 5 minutes), and the freshest of them wins in turn. It lives in `shared/` because the panel could show the same numbers later, and `shared/` is where pure logic tested from `server/src/<module>.test.ts` goes. Turned down: the logic inside `AccountManager`, which would mix it with OAuth and the queue and need the fake `fetch` for every case.

**Consequences:** `server/src/rotation.test.ts` covers every scenario of the spec on the pure function. The service is thin and its test covers only the wiring to `switchHost`, activity and push.

### D2. The usage of an account is the higher of its two percentages

**Context:** The spec ranks accounts and compares them with a 10-point margin, which needs one number per account.

**Decision:** `max(five, seven)` of the usage `rotationAccounts` gives. A machine passes the threshold when `five >= fiveHour` or `seven >= sevenDay`; the limit reported is the one passed (the 5-hour one when both are). Turned down: a weighted sum, which nobody can check by eye in the panel.

**Consequences:** With the default thresholds, the fallback of the spec only fires when the current account is close to 100 % and the target at 90 % or less, as the refinement accepted.

### D3. `AccountRotation` in `server/src/rotation.ts`, driven by events

**Context:** The decision must run when usage changes: the hub's reading of an account (every 5 minutes) or a new kept statusline reading.

**Decision:** A class `AccountRotation` constructed with its collaborators as narrow functions (`settings()`, `accounts()`, `readings()`, `machines()`, `switchHost(host, acc)`, `report(host, event)`), so the test injects them without a hub. `index.ts` calls `rotation.evaluate()` from `accounts.on('change')`, from the machine handler when `usage.add` returned true, and from `settings.on('change')`. `evaluate()` runs one decision round at a time, and a call while one runs joins it. The round is registered before it starts (it begins in a microtask): `AccountManager.switchHost` emits `'change'` synchronously when it starts and in its `finally`, before its promise settles, and that event calls `evaluate()` again; a round registered only when it reached its first wait would let that call start a second round in parallel, which would switch the same machine again. Each round asks `decideRotation` for the next action, performs it, and asks again with the inputs read anew and the machines already handled in this round passed as `skip`, until nothing is left, so two machines on one account see the first switch and a machine whose switch failed is not tried again in the same round. If `decideRotation` ever hands back a machine already in `skip`, the round logs it and stops, so a round makes at most one pass per machine. A round reads everything again after each switch, and between its last decision, which finds nothing to do, and its end there is no wait in which an event could arrive (spec: «Machines on the same account are decided one after the other»). A machine the round already handled is not decided again in it: an event about that machine that joins the round waits for the next event (the accounts' usage poll emits one every 5 minutes at most), a delay accepted to keep a round bounded. Turned down: a timer of its own, which would add a third cadence to the hub without fresher data.

**Consequences:** A wiring change in `server/src/index.ts`: a boot smoke test is required. The test's fake `switchHost` emits the change synchronously at its start and in its `finally`, as `AccountManager` does, so a regression of the registration fails a test.

### D4. The memory of the service lives in memory

**Context:** The back-and-forth guard needs the account each machine left; the single warning and the single failure report need what was already reported.

**Decision:** Maps in `AccountRotation`, passed to `decideRotation` as input: `left` (machine → account left automatically), `warned` (machine → limit → the window it warned about having no target in), `failed` (machine → limit → the window and the reason of the failure it reported, `window|reason`, so a failure with another reason is reported); kept per limit, so a machine over both thresholds whose 5-hour usage crosses its threshold up and down warns once per limit instead of at every crossing, `retryAt` (machine → when a failed switch may be tried again: 5 minutes after the failure, so the `'change'` events that every failure causes, the 1-second re-inspection of `switchHost` among them, do not retry it in a loop) and, kept by the service only, `seen` (machine → the account the last round saw it on). A change of the machine's account by any route (the automatic switch, the panel, a `/login` by hand) clears its `failed` and `retryAt`. After a switch to an account over a threshold, `warned` takes, under the limit the target passed, the target's window, so no warning of no target follows the switch's own report in that window. Nothing is persisted.

**Consequences:** After a hub restart (every deploy), a warning or a failure of a window can be reported once more, and the guard forgets the account left; the next switch only targets accounts below the thresholds or 10 points below, so the worst case is one extra switch.

### D5. The settings are one `HubSettings` field

**Context:** The refinement left open whether the per-machine switch lives in `HubSettings` or in `SavedHost`.

**Decision:** `HubSettings.accountRotation: { fiveHour: number; sevenDay: number; hosts: string[] }`, default `{ fiveHour: 90, sevenDay: 95, hosts: [] }`, sanitised by a `sanitizeAccountRotation` in `shared/rotation.ts` (whole numbers 1 to 100; `hosts` deduplicated strings) on load and in `update()`. A patch carries the whole field; a field whose value is invalid keeps the previous value of that field. `forgetHost` removes the machine from `hosts`. Turned down: `SavedHost`, which is edited through the machine form and `hosts.json` with SSH settings and would need its own route to toggle a switch from a list.

**Consequences:** The panel sends the whole `accountRotation` after each change, as other settings do; with one owner, two devices editing at once is not a concern.

### D6. One activity kind `account` with an `account` field

**Context:** «Actividad» must show switches, warnings and failures with the machine, the accounts, the limit and the percentage.

**Decision:** `ActivityEvent.kind` gains `'account'`, and `ActivityEvent` gains `account?: { from: string; to?: string; limit: 'fiveHour' | 'sevenDay'; pct: number; error?: string }`, with the accounts' aliases at the time of the event (an alias renamed later does not rewrite history). `to` without `error`: a switch; no `to`: no target; `error`: a failed switch to `to`. The panel shows it with the icon 🔄 and only under the «Todo» filter. `pct` is rounded to a whole number when the event is built (Anthropic's `utilization` may carry decimals). The push's title and body are built by `rotationNotice(hostName, event)` in `server/src/rotation.ts`, a pure function tested there (feature logic stays out of `index.ts`), and it uses the tag `account:<host>`, so a later notice of the same machine replaces the earlier one. Turned down: reusing `skipped` and `error`, whose texts the panel builds for automations and scheduled messages.

**Consequences:** `ActivityEvent` consumers: `server/src/activity.ts` (stores any kind), `web/src/components/Activity.tsx` (`ICON`, `what`, the filter). The typecheck flags the `ICON` record; the audit task lists the rest.

### D7. A machine not connected is not switched

**Context:** `switchHost` on a machine without SSH fails after its timeouts.

**Decision:** `decideRotation` turns a machine whose `HostMonitor` status is not `ok` into a failure with the reason «sin conexión», reported once like any failure, instead of calling `switchHost`.

**Consequences:** No SSH timeouts every 5 minutes for a machine that is off; the decision runs again when the machine connects (its `'change'` event).

## Risks / Trade-offs

- [The owner switches a machine back by hand to the account over the threshold] → the hub switches it again at the next decision. The per-machine switch is the way to keep it there; the panel's text says so.
- [The hub's reading is up to 5 minutes old] → the decision also takes kept statusline readings, which arrive with every repaint of a running Claude Code; a machine using the account produces them.
- [Two accounts share an email] → `checkLimits` keeps no statusline reading for them; their usage comes from the hub's reading only.
- [A switch fails halfway] → `switchHost` already re-inspects the machine; the service reports the failure once per window and reason, and tries again 5 minutes later with what the machine says.
- [A switch keeps failing, for example with no spare login of the target] → one attempt every 5 minutes while the machine stays over the threshold, each a few seconds of SSH; the owner adds a login or turns the machine's switch off.

## Migration Plan

No data migration: `settings.json` without `accountRotation` loads the default, and `activity.json` keeps its events. The deploy is the usual merge into `master`. Rolling back the code leaves an unknown `accountRotation` key in `settings.json`, which the previous `SettingsStore` keeps and ignores.
