// Trello's design tokens (--ds-*) reach the shadow root too, since custom properties
// inherit: the dialog follows Trello's light and dark themes. The fallbacks are the light ones.

/** On the page: the button on each card, shown while the card is hovered or the button focused. */
export const PAGE_CSS = `
li[data-testid="list-card"] { position: relative; }
.twb-launch {
  position: absolute;
  top: 6px;
  right: 40px;
  z-index: 30;
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--ds-surface-overlay, #fff);
  color: var(--ds-icon-subtle, #626f86);
  box-shadow: var(--ds-shadow-raised, 0 1px 1px #091e4240, 0 0 1px #091e424f);
  cursor: pointer;
}
li[data-testid="list-card"]:hover > .twb-launch,
.twb-launch:focus-visible { display: flex; }
.twb-launch:hover { background: var(--ds-surface-overlay-hovered, #f1f2f4); color: var(--ds-icon, #44546f); }
.twb-launch:focus-visible { outline: 2px solid var(--ds-border-focused, #388bff); outline-offset: 1px; }
`;

export const DIALOG_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 16px;
  background: var(--ds-blanket, #091e427d);
  font: 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, sans-serif;
  color: var(--ds-text, #172b4d);
}
.dialog {
  width: min(460px, 100%);
  max-height: 76vh;
  overflow: auto;
  border-radius: 12px;
  background: var(--ds-surface-overlay, #fff);
  box-shadow: var(--ds-shadow-overlay, 0 8px 12px #091e4226, 0 0 1px #091e424f);
}
header { padding: 20px 24px 8px; }
h2 { margin: 0; font-size: 16px; line-height: 20px; font-weight: 600; }
.card-name { margin: 4px 0 0; color: var(--ds-text-subtle, #44546f); overflow-wrap: anywhere; }
.body { display: flex; flex-direction: column; gap: 12px; padding: 8px 24px 4px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field[hidden] { display: none; }
.field > span { font-size: 12px; font-weight: 600; color: var(--ds-text-subtle, #44546f); }
select, textarea, input[type='text'] {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--ds-border-input, #8590a2);
  border-radius: 4px;
  background: var(--ds-background-input, #fff);
  color: inherit;
  font: inherit;
}
textarea { resize: vertical; min-height: 64px; }
select:focus, textarea:focus, input[type='text']:focus, input:focus-visible, .btn:focus-visible { outline: 2px solid var(--ds-border-focused, #388bff); outline-offset: 0; }
.check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.check input { width: 16px; height: 16px; margin: 0; }
code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 4px; border-radius: 3px; background: var(--ds-background-neutral, #091e420f); }
.muted { margin: 0; color: var(--ds-text-subtle, #44546f); }
.small { font-size: 12px; line-height: 16px; }
.small:empty { display: none; }
.update {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 24px 0;
  padding: 8px 12px;
  border-radius: 4px;
  background: var(--ds-background-information, #e9f2ff);
  color: var(--ds-text-information, #0055cc);
  font-size: 13px;
}
.update span { flex: 1; }
.error { margin: 0; padding: 8px 12px; border-radius: 4px; background: var(--ds-background-danger, #ffeceb); color: var(--ds-text-danger, #ae2e24); }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px 20px; }
.btn {
  padding: 6px 12px;
  border: 0;
  border-radius: 4px;
  background: var(--ds-background-neutral, #091e420f);
  color: var(--ds-text, #172b4d);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.btn:hover { background: var(--ds-background-neutral-hovered, #091e4224); }
.btn.primary { background: var(--ds-background-brand-bold, #0c66e4); color: var(--ds-text-inverse, #fff); }
.btn.primary:hover { background: var(--ds-background-brand-bold-hovered, #0055cc); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.toasts {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483001;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  font: 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, sans-serif;
}
.toast {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--ds-background-neutral-bold, #44546f);
  color: var(--ds-text-inverse, #fff);
  box-shadow: var(--ds-shadow-overlay, 0 8px 12px #091e4226, 0 0 1px #091e424f);
  cursor: pointer;
}
.toast.warn { background: var(--ds-background-warning-bold, #f5cd47); color: var(--ds-text-warning-inverse, #172b4d); }
.toast.error { background: var(--ds-background-danger-bold, #c9372c); }
`;
