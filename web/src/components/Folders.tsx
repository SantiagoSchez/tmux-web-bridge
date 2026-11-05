import { useEffect, useRef, useState } from 'preact/hooks';
import { baseName, childPath, folderNameProblem, MAX_FOLDERS } from '../../../shared/folders';
import type { DirListing, HostInfo, SavedFolder } from '../../../shared/types';
import { dialog, folderHost, hosts, hubSettings, toast } from '../state';
import { hub } from '../ws';

function saveFolders(hostId: string, list: SavedFolder[]): void {
  hub.send({ t: 'settings', settings: { folders: { [hostId]: list } } });
}

/** Why a folder can't be added (or renamed) with this name, or null. */
function nameProblem(list: SavedFolder[], name: string, except?: SavedFolder): string | null {
  const why = folderNameProblem(name);
  if (why) return why;
  return list.some((f) => f !== except && f.name === name.trim()) ? `Ya hay una carpeta llamada «${name.trim()}».` : null;
}

/** «Carpetas»: the folders each machine offers in «Nuevo space», added from here. */
export function FolderSettings() {
  const all = hosts.value;
  const host = all.find((h) => h.id === folderHost.value) ?? all[0];
  const [picking, setPicking] = useState(false);
  useEffect(() => setPicking(false), [host?.id]);
  const s = hubSettings.value;
  if (!host || !s) return null;
  const list = s.folders[host.id] ?? [];

  const rename = (f: SavedFolder) => {
    dialog.value = {
      kind: 'prompt',
      title: 'Cambiar el nombre',
      label: f.path,
      value: f.name,
      placeholder: 'Nombre del space',
      confirm: 'Guardar',
      onSubmit: (name) => {
        if (name.trim() === f.name) return;
        const why = nameProblem(list, name, f);
        if (why) return toast(why, 'error');
        saveFolders(host.id, list.map((o) => (o === f ? { ...o, name: name.trim() } : o)));
      },
    };
  };

  return (
    <>
      <p class="settings-scope dim small">
        Las carpetas que ofrece «Nuevo space» en cada máquina, además de su carpeta de proyectos. Al elegir una se abre un space con su nombre, en esa carpeta y con
        Claude. Se guardan en el servidor central.
      </p>
      {all.length > 1 && (
        <div class="seg seg-wrap" role="radiogroup" aria-label="Máquina">
          {all.map((h) => (
            <button key={h.id} role="radio" aria-checked={h.id === host.id} class={h.id === host.id ? 'on' : ''} onClick={() => (folderHost.value = h.id)}>
              {h.name}
            </button>
          ))}
        </div>
      )}
      <section class="setting">
        {list.length ? (
          <ul class="folder-list">
            {list.map((f) => (
              <li key={f.name}>
                <span class="project-text">
                  <span class="project-name">{f.name}</span>
                  <span class="project-hint">{f.path}</span>
                </span>
                <button class="icon-btn small-btn" aria-label={`Cambiar el nombre de ${f.name}`} title="Cambiar el nombre" onClick={() => rename(f)}>
                  ✎
                </button>
                <button
                  class="icon-btn small-btn"
                  aria-label={`Quitar ${f.name}`}
                  title="Quitar (la carpeta no se borra)"
                  onClick={() => saveFolders(host.id, list.filter((o) => o !== f))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="dim small">{host.projects ? 'Solo la carpeta de proyectos, sin carpetas añadidas.' : 'Ninguna carpeta todavía: «Nuevo space» abre un space vacío.'}</p>
        )}
        {picking ? (
          <FolderPicker
            host={host}
            list={list}
            onAdd={(f) => {
              saveFolders(host.id, [...list, f]);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <div class="row-btns">
            <button class="btn" disabled={host.status !== 'ok' || list.length >= MAX_FOLDERS} onClick={() => setPicking(true)}>
              ＋ Añadir carpeta
            </button>
          </div>
        )}
        {host.status !== 'ok' && !picking && <p class="settings-state small">{host.name} no está conectada: para añadir carpetas tiene que estarlo.</p>}
      </section>
    </>
  );
}

/** Browses the machine's folders from ~ (or a path typed by hand) and adds the one shown. */
function FolderPicker({ host, list, onAdd, onCancel }: { host: HostInfo; list: SavedFolder[]; onAdd: (f: SavedFolder) => void; onCancel: () => void }) {
  const [at, setAt] = useState<DirListing | null>(null);
  const [path, setPath] = useState('~');
  const [name, setName] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const go = async (to: string): Promise<DirListing | null> => {
    setBusy(true);
    try {
      const l = await hub.action<DirListing>(host.id, { op: 'listDirs', path: to.trim() });
      setAt(l);
      setPath(l.path);
      setName(null);
      listRef.current?.scrollTo(0, 0);
      return l;
    } catch {
      return null; // the error is already a toast
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => void go('~'), []);

  const typed = path.trim() !== at?.path;
  const shownName = name ?? (typed ? baseName(path.trim()) : at ? baseName(at.path) : '');
  const already = at && !typed ? list.find((f) => f.path === at.path) : undefined;
  const problem = already ? `Ya está añadida como «${already.name}».` : at ? nameProblem(list, shownName) : null;

  const add = async () => {
    // A path typed but not opened yet: open it first, so only folders that exist go in.
    const l = typed ? await go(path) : at;
    if (!l) return;
    const finalName = name ?? baseName(l.path);
    const why = list.find((f) => f.path === l.path) ? `Ya está añadida como «${list.find((f) => f.path === l.path)!.name}».` : nameProblem(list, finalName);
    if (why) return toast(why, 'error');
    onAdd({ name: finalName.trim(), path: l.path });
  };

  const dirs = at ? at.dirs.filter((d) => hidden || !d.startsWith('.')) : [];
  return (
    <div class="folder-picker">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void go(path);
        }}
      >
        <input
          class="text-input"
          value={path}
          placeholder="~/carpeta o /ruta/absoluta"
          aria-label="Ruta de la carpeta"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setPath(e.currentTarget.value)}
        />
      </form>
      <label class="kb-check">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.currentTarget.checked)} />
        Mostrar carpetas ocultas
      </label>
      <ul class="menu folder-dirs" ref={listRef} aria-busy={busy}>
        {!at && <li class="dim pad">Cargando…</li>}
        {at?.parent && (
          <li>
            <button class="menu-item" disabled={busy} onClick={() => void go(at.parent!)}>
              <span class="menu-icon">↑</span>
              <span class="project-name">..</span>
            </button>
          </li>
        )}
        {dirs.map((d) => (
          <li key={d}>
            <button class="menu-item" disabled={busy} onClick={() => void go(childPath(at!.path, d))}>
              <span class="menu-icon">▸</span>
              <span class="project-name">{d}</span>
            </button>
          </li>
        ))}
        {at && !dirs.length && <li class="dim pad">{at.dirs.length ? 'Solo hay carpetas ocultas.' : 'No hay carpetas dentro.'}</li>}
      </ul>
      <label class="folder-name">
        <span class="dim small">Nombre del space</span>
        <input
          class="text-input"
          value={shownName}
          aria-label="Nombre del space"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      {problem && !typed && <p class="settings-state small">{problem}</p>}
      <div class="row-btns">
        <button class="btn btn-primary" disabled={busy || !at || (!typed && !!problem)} onClick={() => void add()}>
          Añadir esta carpeta
        </button>
        <button class="btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
