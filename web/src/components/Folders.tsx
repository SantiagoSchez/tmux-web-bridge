import { useEffect, useState } from 'preact/hooks';
import { baseName, DEFAULT_COMMAND, folderNameProblem, MAX_FOLDERS, sameFolder } from '../../../shared/folders';
import type { HostInfo, SavedFolder } from '../../../shared/types';
import { dialog, folderHost, hosts, hubSettings, toast } from '../state';
import { hub } from '../ws';
import { Explorer, useExplorer } from './Explorer';
import { openFile } from './Files';

function saveFolders(hostId: string, list: SavedFolder[]): void {
  hub.send({ t: 'settings', settings: { folders: { [hostId]: list } } });
}

function folderCount(n: number): string {
  return n === 0 ? 'sin carpetas' : n === 1 ? '1 carpeta' : `${n} carpetas`;
}

/** Why a folder can't be added (or renamed) with this name, or null. */
export function nameProblem(list: SavedFolder[], name: string, except?: SavedFolder): string | null {
  const why = folderNameProblem(name);
  if (why) return why;
  return list.some((f) => f !== except && f.name === name.trim()) ? `Ya hay una carpeta llamada «${name.trim()}».` : null;
}

/** «Carpetas»: the folders each machine offers in «Nuevo espacio», added from here. */
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
      placeholder: 'Nombre del espacio',
      confirm: 'Guardar',
      onSubmit: (name) => {
        if (name.trim() === f.name) return;
        const why = nameProblem(list, name, f);
        if (why) return toast(why, 'error');
        saveFolders(host.id, list.map((o) => (o === f ? { ...o, name: name.trim() } : o)));
      },
    };
  };

  const toggleSubfolders = (f: SavedFolder) => {
    const on = !f.subfolders;
    const twin = list.find((o) => o !== f && sameFolder(o, f.path, on));
    if (twin) return toast(`Ya está añadida así como «${twin.name}».`, 'error');
    saveFolders(host.id, list.map((o) => (o === f ? (on ? { ...o, subfolders: true } : { name: o.name, path: o.path }) : o)));
  };

  return (
    <>
      <p class="settings-scope dim small">
        Las carpetas que ofrece «Nuevo espacio» en cada máquina. Al elegir una se abre un espacio con su nombre, en esa carpeta y con el comando de la máquina. Con
        «Subcarpetas», la carpeta ofrece cada una de las que tiene dentro, siempre al día, y en ella se pueden crear proyectos nuevos. Se guardan en el servidor
        central.
      </p>
      {all.length > 1 && (
        <label class="folder-host">
          <span class="dim small">Máquina</span>
          <select class="text-input" value={host.id} onChange={(e) => (folderHost.value = e.currentTarget.value)}>
            {all.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} · {folderCount(s.folders[h.id]?.length ?? 0)}
              </option>
            ))}
          </select>
        </label>
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
                <label class="kb-check folder-sub" title="Ofrecer cada carpeta que tenga dentro, en vez de esta">
                  <input type="checkbox" checked={!!f.subfolders} onChange={() => toggleSubfolders(f)} />
                  Subcarpetas
                </label>
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
          <p class="dim small">Ninguna carpeta todavía: «Nuevo espacio» abre un espacio vacío.</p>
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
      <CommandSetting key={host.id} hostId={host.id} value={s.commands[host.id] ?? DEFAULT_COMMAND} />
    </>
  );
}

/** What is typed into a space opened from a folder of this machine. */
function CommandSetting({ hostId, value }: { hostId: string; value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const save = () => text.trim() !== value && hub.send({ t: 'settings', settings: { commands: { [hostId]: text.trim() } } });
  return (
    <section class="setting">
      <h3>Comando al abrir</h3>
      <p class="dim small">
        Lo que se escribe en el espacio al abrirlo desde una carpeta; al salir queda la shell. A <code>claude</code> se le añade el modo de permisos de la casilla
        «Saltarse los permisos». Vacío: solo la shell.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          class="text-input mono"
          value={text}
          placeholder="Solo la shell"
          aria-label="Comando al abrir"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setText(e.currentTarget.value)}
          onBlur={save}
        />
      </form>
      {value !== DEFAULT_COMMAND && (
        <div class="row-btns">
          <button class="btn" onClick={() => hub.send({ t: 'settings', settings: { commands: { [hostId]: DEFAULT_COMMAND } } })}>
            Volver a claude
          </button>
        </div>
      )}
    </section>
  );
}

/** «Subcarpetas» for a folder about to be added: it offers each folder inside instead. */
export function SubfoldersCheck({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label class="kb-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      Incluir todas sus subcarpetas (siempre al día)
    </label>
  );
}

/** Browses the machine from ~ (or a path typed by hand) with the explorer and adds the folder shown. */
function FolderPicker({ host, list, onAdd, onCancel }: { host: HostInfo; list: SavedFolder[]; onAdd: (f: SavedFolder) => void; onCancel: () => void }) {
  const b = useExplorer({ host: host.id }, 'settings');
  const { at, busy, typed } = b;
  const [name, setName] = useState<string | null>(null);
  const [subfolders, setSubfolders] = useState(false);
  // Somewhere else: the name is that folder's again.
  useEffect(() => setName(null), [at]);

  const shownName = name ?? (typed ? baseName(b.path.trim()) : at ? baseName(at.path) : '');
  const already = at && !typed ? list.find((f) => sameFolder(f, at.path, subfolders)) : undefined;
  const problem = already ? `Ya está añadida como «${already.name}».` : at ? nameProblem(list, shownName) : null;

  const add = async () => {
    const l = await b.here();
    if (!l) return;
    const finalName = name ?? baseName(l.path);
    const twin = list.find((f) => sameFolder(f, l.path, subfolders));
    const why = twin ? `Ya está añadida como «${twin.name}».` : nameProblem(list, finalName);
    if (why) return toast(why, 'error');
    onAdd(subfolders ? { name: finalName.trim(), path: l.path, subfolders } : { name: finalName.trim(), path: l.path });
  };

  return (
    <div class="folder-picker">
      <Explorer x={b} open={(path) => openFile({ host: host.id }, path)} />
      <SubfoldersCheck checked={subfolders} onChange={setSubfolders} />
      <label class="folder-name">
        <span class="dim small">{subfolders ? 'Nombre (para reconocerla en esta lista)' : 'Nombre del espacio'}</span>
        <input
          class="text-input"
          value={shownName}
          aria-label={subfolders ? 'Nombre' : 'Nombre del espacio'}
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
