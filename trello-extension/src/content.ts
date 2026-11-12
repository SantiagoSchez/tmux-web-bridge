import { cardWorktreeName, folderGroups, launchTarget, rememberedChoice, renderTemplate, spaceChoices, worktreeNameProblem } from './logic';
import type { ExtHostTargets, ExtLaunchResult, LaunchContext, Reply, Request } from './types';
import { DIALOG_CSS, PAGE_CSS } from './styles';

// On trello.com: a button on every card of the board (shown on hover) that opens the
// launch dialog. Everything else (twb and the Trello API) happens in the service worker.

const CARD = 'li[data-testid="list-card"]';
const ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm0 1.5v6.5h11V5h-11Zm1.7 1.2 2.3 1.8-2.3 1.8-.9-1.1L4.5 8l-1.2-.9.9-.9ZM7.5 9.5h3.5V11H7.5V9.5Z"/></svg>`;

class AskError extends Error {
  constructor(
    message: string,
    readonly setup = false,
  ) {
    super(message);
  }
}

async function ask<T>(msg: Request): Promise<T> {
  let reply: Reply<T> | undefined;
  try {
    reply = await chrome.runtime.sendMessage(msg);
  } catch {
    throw new AskError('La extensión se ha actualizado: recarga la página de Trello.');
  }
  if (!reply) throw new AskError('La extensión no ha contestado: recarga la página de Trello.');
  if (!reply.ok) throw new AskError(reply.error, reply.setup);
  return reply.data;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...children);
  return node;
}

// ---------------------------------------------------------------- shadow root (dialog and toasts)

let root: ShadowRoot | null = null;

function shadow(): ShadowRoot {
  if (root?.host.isConnected) return root;
  const host = el('div', { id: 'twb-launcher-root' });
  document.body.append(host);
  root = host.attachShadow({ mode: 'open' });
  root.append(el('style', { textContent: DIALOG_CSS }), el('div', { class: 'toasts', role: 'status' }));
  return root;
}

function toast(text: string, kind: 'ok' | 'warn' | 'error' = 'ok'): void {
  const box = shadow().querySelector('.toasts')!;
  const t = el('div', { class: `toast ${kind}` }, text);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'ok' ? 6000 : 12000);
  t.addEventListener('click', () => t.remove());
}

// ---------------------------------------------------------------- dialog

let open: { close: () => void } | null = null;

function openDialog(cardId: string, fallbackName: string): void {
  open?.close();
  const r = shadow();
  const body = el('div', { class: 'body' }, el('p', { class: 'muted' }, 'Cargando máquinas y tarjeta…'));
  const footer = el('footer');
  const title = el('h2', { id: 'twb-title' }, 'Lanzar con Claude');
  const sub = el('p', { class: 'card-name' }, fallbackName);
  const dialog = el('div', { class: 'dialog', role: 'dialog' }, el('header', {}, title, sub), body, footer);
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'twb-title');
  const backdrop = el('div', { class: 'backdrop' }, dialog);
  r.append(backdrop);

  const previous = document.activeElement as HTMLElement | null;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    open = null;
    previous?.focus?.();
  };
  open = { close };
  let submit: (() => void) | null = null;
  // Captured before Trello's own shortcuts: while the dialog is open, keys are its own.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && submit) {
      e.preventDefault();
      submit();
    }
    e.stopPropagation();
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });

  const cancel = el('button', { type: 'button', class: 'btn' }, 'Cancelar');
  cancel.addEventListener('click', close);
  footer.append(cancel);
  cancel.focus();

  const fail = (err: unknown) => {
    const e = err instanceof AskError ? err : new AskError((err as Error).message);
    body.replaceChildren(el('p', { class: 'error' }, e.message));
    if (e.setup) {
      const opts = el('button', { type: 'button', class: 'btn primary' }, 'Abrir opciones');
      opts.addEventListener('click', () => {
        void ask({ type: 'openOptions' });
        close();
      });
      footer.append(opts);
    }
  };

  // A newer version on disk: said above the form, with the way to load it.
  ask<{ version: string | null }>({ type: 'update' }).then(({ version }) => {
    if (!version || open?.close !== close) return;
    const reload = el('button', { type: 'button', class: 'btn' }, 'Recargar');
    reload.addEventListener('click', () => void ask({ type: 'openExtensions' }));
    dialog.insertBefore(el('div', { class: 'update' }, el('span', {}, `Versión ${version} de la extensión lista: recárgala en chrome://extensions.`), reload), body);
  }, () => {});

  ask<LaunchContext>({ type: 'context', cardId }).then((ctx) => {
    if (open?.close !== close) return;
    sub.textContent = ctx.card.name;
    submit = buildForm(ctx, body, footer, close, fail);
  }, fail);
}

/** Fills the dialog with the form. Returns what launches it. */
function buildForm(ctx: LaunchContext, body: HTMLElement, footer: HTMLElement, close: () => void, fail: (err: unknown) => void): () => void {
  const hosts = ctx.targets.hosts;
  const hostSel = el('select', { id: 'twb-host' });
  for (const h of hosts) {
    const o = el('option', { value: h.id, disabled: h.status !== 'ok' }, h.status === 'ok' ? h.name : `${h.name} (sin conexión)`);
    hostSel.append(o);
  }
  const spaceSel = el('select', { id: 'twb-space' });
  const destSel = el('select', { id: 'twb-dest' });
  const note = el('p', { class: 'muted small' });
  const prompt = el('textarea', { id: 'twb-prompt', rows: 3, value: renderTemplate(ctx.promptTemplate, ctx.card) });
  const skip = el('input', { type: 'checkbox', id: 'twb-skip', checked: ctx.skipPermissions });
  const inWorktree = el('input', { type: 'checkbox', id: 'twb-wt', checked: ctx.worktree });
  const wtName = el('input', { type: 'text', id: 'twb-wt-name', value: cardWorktreeName(ctx.card.idShort, ctx.card.name), spellcheck: false, autocomplete: 'off' });
  const wtNote = el('p', { class: 'error small' });
  const wtField = el('label', { class: 'field' }, el('span', {}, 'Worktree (y rama)'), wtName, wtNote);
  const launchBtn = el('button', { type: 'button', class: 'btn primary' }, 'Lanzar');

  const current = () => hosts.find((h) => h.id === hostSel.value);
  /** The folder list: with an open space picked, its own folder first; without one, a folder is a must. */
  const fillFolders = (host: ExtHostTargets | undefined, wanted: string) => {
    const inSpace = !!spaceSel.value;
    destSel.replaceChildren(el('option', { value: '', disabled: !inSpace }, inSpace ? 'La del space (donde esté)' : 'Elige una carpeta…'));
    for (const g of host ? folderGroups(host, !inSpace) : []) {
      const group = el('optgroup', { label: g.label });
      for (const d of g.items) group.append(el('option', { value: d.key }, d.label));
      destSel.append(group);
    }
    destSel.value = wanted;
    if (destSel.value !== wanted) destSel.value = '';
  };
  const fillDestinations = (host: ExtHostTargets | undefined, wanted = { space: '', folder: '' }) => {
    spaceSel.replaceChildren(el('option', { value: '' }, 'El de la carpeta (nuevo o abierto)'));
    note.textContent = '';
    const spaces = host ? spaceChoices(host) : [];
    if (spaces.length) {
      const group = el('optgroup', { label: 'Spaces abiertos (ventana nueva)' });
      for (const s of spaces) group.append(el('option', { value: s.key }, s.label));
      spaceSel.append(group);
    }
    spaceSel.value = wanted.space;
    if (spaceSel.value !== wanted.space) spaceSel.value = '';
    fillFolders(host, wanted.folder);
    if (host?.foldersError) note.textContent = `No se han podido leer las carpetas: ${host.foldersError}`;
    else if (host && !spaces.length && !folderGroups(host).length) note.textContent = 'Esta máquina no tiene spaces abiertos ni carpetas en Ajustes › Carpetas de twb.';
    update();
  };
  const target = () => {
    const host = current();
    return host && launchTarget(host, spaceSel.value, destSel.value);
  };
  const update = () => {
    const problem = inWorktree.checked ? worktreeNameProblem(wtName.value.trim()) : null;
    wtField.hidden = !inWorktree.checked;
    wtNote.textContent = problem ?? '';
    launchBtn.disabled = !target() || (!prompt.value.trim() && !inWorktree.checked) || !!problem;
  };

  const remembered = ctx.remembered && hosts.find((h) => h.id === ctx.remembered!.host && h.status === 'ok');
  const first = remembered ?? hosts.find((h) => h.status === 'ok');
  if (first) hostSel.value = first.id;
  else note.textContent = 'Ninguna máquina está conectada a twb ahora mismo.';
  fillDestinations(first, remembered ? rememberedChoice(ctx.remembered) : undefined);

  hostSel.addEventListener('change', () => fillDestinations(current()));
  spaceSel.addEventListener('change', () => {
    fillFolders(current(), destSel.value);
    update();
  });
  destSel.addEventListener('change', update);
  prompt.addEventListener('input', update);
  inWorktree.addEventListener('change', update);
  wtName.addEventListener('input', update);
  update();

  body.replaceChildren(
    el('label', { class: 'field' }, el('span', {}, 'Máquina'), hostSel),
    el('label', { class: 'field' }, el('span', {}, 'Space'), spaceSel),
    el('label', { class: 'field' }, el('span', {}, 'Carpeta'), destSel),
    note,
    el('label', { class: 'field' }, el('span', {}, 'Prompt'), prompt),
    el('label', { class: 'check' }, inWorktree, el('span', {}, 'En un worktree nuevo ', el('code', {}, 'claude --worktree'))),
    wtField,
    el('label', { class: 'check' }, skip, el('span', {}, 'Saltar permisos ', el('code', {}, '--dangerously-skip-permissions'))),
  );
  footer.append(launchBtn);
  (target() ? launchBtn : destSel).focus();

  const run = async () => {
    const dest = target();
    if (!dest || launchBtn.disabled) return;
    launchBtn.disabled = true;
    launchBtn.textContent = 'Lanzando…';
    try {
      const worktree = inWorktree.checked ? wtName.value.trim() : undefined;
      const r = await ask<ExtLaunchResult>({
        type: 'launch',
        card: ctx.card,
        destination: destSel.value,
        space: spaceSel.value,
        worktree: inWorktree.checked,
        req: { host: hostSel.value, target: dest, prompt: prompt.value.trim(), name: worktree ?? ctx.card.name, skipPermissions: skip.checked, worktree },
      });
      close();
      const movedTo = r.trello?.movedTo;
      toast(`Lanzada en ${r.hostName} › ${r.space} · ventana «${r.windowName}»${movedTo ? ` · movida a ${movedTo}` : ''}`);
      for (const w of r.trello?.warnings ?? []) toast(w, 'warn');
    } catch (err) {
      launchBtn.textContent = 'Lanzar';
      launchBtn.disabled = false;
      if (err instanceof AskError && err.setup) fail(err);
      else toast((err as Error).message, 'error');
    }
  };
  launchBtn.addEventListener('click', () => void run());
  return () => void run();
}

// ---------------------------------------------------------------- the button on each card

function cardId(li: Element): string | null {
  return li.querySelector('[data-card-id]')?.getAttribute('data-card-id') ?? li.getAttribute('data-card-drop-card-id');
}

function decorate(li: HTMLElement): void {
  if (li.querySelector(':scope > .twb-launch')) return;
  const btn = el('button', { type: 'button', class: 'twb-launch', title: 'Lanzar con Claude (twb)', innerHTML: ICON });
  btn.setAttribute('aria-label', 'Lanzar con Claude');
  btn.draggable = false;
  // Trello opens the card (or starts dragging it) on these: the button keeps them.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'dragstart']) {
    btn.addEventListener(type, (e) => e.stopPropagation());
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = cardId(li);
    const name = li.querySelector('[data-testid="card-name"]')?.textContent?.trim() ?? '';
    if (id) openDialog(id, name);
    else toast('No se reconoce esta tarjeta', 'error');
  });
  li.append(btn);
}

function scan(): void {
  for (const li of document.querySelectorAll<HTMLElement>(CARD)) decorate(li);
}

// A timer, not requestAnimationFrame: that one waits while the tab is in the background.
let queued = false;
function schedule(): void {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    scan();
  }, 50);
}

document.head.append(el('style', { id: 'twb-launcher-style', textContent: PAGE_CSS }));
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
scan();
