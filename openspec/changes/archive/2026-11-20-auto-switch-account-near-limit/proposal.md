# Proposal

GitHub issue: [Issue #64](https://github.com/SantiagoSchez/tmux-web-bridge/issues/64), «Rotar sola la cuenta de una máquina cuando se acerque al límite de 5 h o al semanal». The refinement in its body holds the decisions this proposal follows.

## Why

When the Claude account a machine uses gets close to its 5-hour or weekly limit, the owner has to switch it by hand from the panel. If nobody is looking, the machine's Claude Codes stop when the limit runs out, even though other accounts still have usage left. The hub already reads every account's usage and already knows how to switch a machine without restarting its Claude Codes; it only lacks the decision to do it on its own.

## What Changes

- The hub switches a machine to another account on its own when the machine's current account reaches a threshold of its 5-hour or its weekly limit, with the same switch the panel makes (`AccountManager.switchHost`).
- Two thresholds, the same for every machine and editable in Ajustes › Máquinas: 90 % of the 5-hour limit and 95 % of the weekly one by default.
- A switch per machine in Ajustes › Máquinas turns the automatic switch on, off by default.
- The target is an account the hub holds a spare login of, below both thresholds, preferring one no other machine uses and, among those, the least used one. An account's usage is the higher of its two percentages, from the freshest reading the hub trusts (its own, or a statusline's that is not foreign).
- When no candidate is below both thresholds, the hub switches to the least used one only if its usage is at least 10 points below the current account's. When there is no target, the machine stays and the hub warns once per limit window.
- An account a machine just left automatically is not a target for that machine again while it stays over a threshold. The machine never goes back on its own to the account it left.
- Every automatic switch, warning and failure leaves an entry in «Actividad» and sends a push notification, which the quiet hours silence as any other push.
- Contract changes: `HubSettings` gains `accountRotation` (the two thresholds and the machines it is on for); `ActivityEvent.kind` gains `account`, with a new optional `account` field. Both travel over the existing websocket messages (`settings`, `activityAdd` and the initial snapshot). No new endpoint, no new environment variable, no data migration: `settings.json` and `activity.json` take the new fields with defaults.

## Capabilities

### New Capabilities

- `account-auto-switch`: when and to which account the hub switches a machine on its own as its account nears a usage limit, how the owner turns it on and sets the thresholds, and how the hub reports what it did.

### Modified Capabilities

None. The switch itself (`claude-accounts`) and the usage readings (`usage-limits`) keep their requirements; this change only decides when to use them.

## Impact

- Layers: `server` (the decision, its wiring in `server/src/index.ts`, the settings, the activity entries and the push notifications), `shared` (`HubSettings`, `ActivityEvent`, and the pure decision logic), `web` (the controls in Ajustes › Máquinas and the new entries in «Actividad»).
- Not touched: `host-kit`, `trello-extension`.
- External services: Anthropic's OAuth endpoints, through the existing switch only. The hub reads usage no more often than now (`USAGE_EVERY`, 5 minutes per account).
- Wiring: a new service is instantiated and wired to the accounts' and machines' events in `server/src/index.ts`, so the change needs a boot smoke test.

## Non-goals

- The weekly limits of a single model (Fable and others).
- Thresholds that differ per machine.
- Going back on its own to the original account when its window resets.
- Waiting for the machine to be idle before switching.
- Logging in on its own to an account the hub holds no spare login of.
