# Design

## Context

`web/src/components/Mic.tsx` renders the 🎤 button in two places: the key bar (`TerminalView.tsx`, class `key`, with the key bar's label) and the window header (`WindowView.tsx`, class `reload-btn`). `MicButton` reads the `dictating` signal of `web/src/dictation.ts` (`phase: 'recording' | 'sending'`, `since`) and, in hold mode, delegates to its child `HoldMic`.

The recording clock is redrawn by a 500 ms `setInterval` in `MicButton` that bumps a local `useState`. In tap mode `MicButton` renders the clock itself, so the tick redraws it. In hold mode `HoldMic` renders it. `@preact/signals` 2.x replaces `shouldComponentUpdate` for every component that reads a signal: when the parent re-renders and the child's props are all equal, the child is skipped. `HoldMic` reads `dictating.value` and gets the same props on every tick, so it renders once, at `● 0:00`, and is not redrawn until the signal changes (the release). A minimal page with the same shape, run in a headless browser, confirmed it: the parent ticked four times while the child stayed at its first value.

While the hub transcribes (`phase: 'sending'`), `MicButton` renders a disabled button with «…» and the class `mic busy`, which pulses its opacity.

## Goals / Non-Goals

**Goals:**

- The clock is redrawn by the component that renders it, so no memoisation between a parent and a child can freeze it again.
- A spinning ring for the transcribing state, built from the stylesheet's tokens so both themes follow.

**Non-Goals:**

- Changing `web/src/dictation.ts` or its signals: the phases already say what the button has to show.
- Moving logic to `shared/`: there is no pure logic here worth a test.

## Decisions

### D1. The recording clock is a component that owns its own tick

A `RecClock` component in `Mic.tsx` takes `since`, keeps the 500 ms interval and the local tick state, and renders `● m:ss`. Both modes render it where they now write the clock. The interval starts when it mounts and stops when it unmounts, that is, exactly while the button records. `MicButton` loses its interval and its `tick` state.

Alternatives considered:

- Pass the tick count to `HoldMic` as a prop, so its props change on every tick. It works, but it leaves the fix depending on a prop nobody reads, which a later clean-up would remove.
- A module-level `now` signal ticking every 500 ms that both buttons read. It also works, but it is a global timer for a state only one button shows at a time, and it has to be started and stopped from the dictation's phases.
- Move the interval into `HoldMic` as well. Two copies of the same timer, one per mode.

### D2. The transcribing state is a CSS ring inside the disabled button

While `phase` is `sending`, the button keeps its normal class (no `rec`, so no red), stays `disabled` with `aria-label="Transcribiendo"`, and holds an `aria-hidden` `span` with class `mic-spinner`: a circle drawn with a `border` in `currentColor` whose top side is transparent, turned by a new `@keyframes spin`. Its size follows the button's font size (`1em`), so it fits the key bar at any `--key-scale` and the header button alike. The «…» text and the `pulse` animation on `.mic.busy` go away. `.mic.busy` sets `opacity: 1`: the global `button:disabled` rule fades a disabled button to 0.4, which left the ring faint and the background not the button's normal one.

Alternatives considered:

- An SVG icon in `icons.tsx`. It would need the same rotation from CSS and adds a file to touch for a plain circle.
- Keeping the red background while transcribing, as a continuation of the recording. The owner chose the normal background.

## Risks / Trade-offs

- [The global `prefers-reduced-motion` rule stops every animation] → The ring stays still with its gap, still distinct from 🎤, and the button stays disabled with its «Transcribiendo» label, so the state is still announced.
- [No automated test can cover this: `web` has no test runner, and there is no pure logic to move to `shared/`] → The tasks include a check in a real browser of both modes and of the ring, against a running panel, on a phone-sized viewport and a wide one.
