import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ProjectList } from '../../../shared/types';
import { newSession, openSessionWhenReady } from '../menus';
import { dialog, dismissToast, toasts, type Dialog } from '../state';
import { IconClose } from './icons';
import { hub } from '../ws';

/** Bottom sheet on the phone, centred card on wide screens. Escape or a tap outside closes it. */
export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-grip" />
        <div class="sheet-head">
          <h2>{title}</h2>
          {subtitle && <p class="dim small">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dialogs() {
  const d = dialog.value;
  if (!d) return null;
  const close = () => (dialog.value = null);
  if (d.kind === 'menu') {
    return (
      <Sheet title={d.title} subtitle={d.subtitle} onClose={close}>
        <ul class="menu">
          {d.items.map((it) => (
            <li key={it.label}>
              <button
                class={`menu-item ${it.danger ? 'danger' : ''}`}
                disabled={it.disabled}
                onClick={() => {
                  close();
                  it.run();
                }}
              >
                <span class="menu-icon">{it.icon}</span>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }
  if (d.kind === 'confirm') return <ConfirmDialog d={d} close={close} />;
  if (d.kind === 'project') return <ProjectDialog d={d} close={close} />;
  return <PromptDialog d={d} close={close} />;
}

function ConfirmDialog({ d, close }: { d: Extract<Dialog, { kind: 'confirm' }>; close: () => void }) {
  return (
    <Sheet title={d.title} onClose={close}>
      <p class="sheet-text">{d.message}</p>
      <div class="sheet-actions">
        <button class="btn" onClick={close}>
          Cancelar
        </button>
        <button
          class={`btn ${d.danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => {
            close();
            d.onSubmit();
          }}
        >
          {d.confirm}
        </button>
      </div>
    </Sheet>
  );
}

function PromptDialog({ d, close }: { d: Extract<Dialog, { kind: 'prompt' }>; close: () => void }) {
  const [value, setValue] = useState(d.value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Sheet title={d.title} subtitle={d.label} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
          d.onSubmit(value.trim());
        }}
      >
        <input
          ref={input}
          class="text-input"
          value={value}
          placeholder={d.placeholder}
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <div class="sheet-actions">
          <button type="button" class="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary">
            {d.confirm}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * "Nuevo space" on a host with a projects folder, like the `c` shell function:
 * pick a shortcut or a project (or type a new name to create it) and the space
 * opens in its folder with claude running. An open project's space is reused.
 */
function ProjectDialog({ d, close }: { d: Extract<Dialog, { kind: 'project' }>; close: () => void }) {
  const [list, setList] = useState<ProjectList | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    hub.action<ProjectList>(d.host.id, { op: 'listProjects' }).then(setList, close);
    input.current?.focus();
  }, []);

  const q = query.trim();
  const items = useMemo(() => {
    if (!list) return [];
    const all = [
      ...list.shortcuts.map((s) => ({ name: s.name, hint: s.path })),
      ...list.projects.filter((p) => !list.shortcuts.some((s) => s.name === p)).map((p) => ({ name: p, hint: '' })),
    ];
    const lq = q.toLowerCase();
    return lq ? all.filter((i) => i.name.toLowerCase().includes(lq)) : all;
  }, [list, q]);
  const exact = items.some((i) => i.name === q);
  const valid = q && !q.includes('/') && !q.startsWith('.');

  const open = async (name: string, create = false) => {
    setBusy(true);
    try {
      const res = await hub.action<{ session: string }>(d.host.id, { op: 'openProject', name, create });
      close();
      openSessionWhenReady(d.host.id, res.session);
    } catch {
      setBusy(false); // the error is already a toast
    }
  };

  return (
    <Sheet title="Abrir proyecto" subtitle={list ? `${d.host.name} · ${list.dir}` : d.host.name} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !q) return;
          if (exact) void open(q);
          else if (items.length === 1) void open(items[0].name);
          else if (valid) void open(q, true);
        }}
      >
        <input
          ref={input}
          class="text-input"
          value={query}
          placeholder="Buscar o crear un proyecto"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </form>
      <ul class="menu project-list">
        {valid && !exact && (
          <li>
            <button class="menu-item" disabled={busy} onClick={() => void open(q, true)}>
              <span class="menu-icon">＋</span>
              <span>
                Crear proyecto «{q}»
              </span>
            </button>
          </li>
        )}
        {!list && <li class="dim pad">Cargando…</li>}
        {items.map((i) => (
          <li key={i.name}>
            <button class="menu-item" disabled={busy} onClick={() => void open(i.name)}>
              <span class="menu-icon">▸</span>
              <span class="project-text">
                <span class="project-name">{i.name}</span>
                {i.hint && <span class="project-hint">{i.hint}</span>}
              </span>
            </button>
          </li>
        ))}
        {list && !items.length && !valid && <li class="dim pad">No hay proyectos.</li>}
      </ul>
      <div class="sheet-actions">
        <button
          class="btn"
          onClick={() => {
            close();
            newSession(d.host, true);
          }}
        >
          Space vacío
        </button>
      </div>
    </Sheet>
  );
}

export function Toasts() {
  const list = toasts.value;
  if (!list.length) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          <span class="toast-text">{t.text}</span>
          <button class="toast-close" aria-label="Cerrar aviso" onClick={() => dismissToast(t.id)}>
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
