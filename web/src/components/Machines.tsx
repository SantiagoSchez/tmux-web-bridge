import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { HubAddresses, KitReport, MachineCheck, MachineVia, SavedHost } from '../../../shared/types';
import { slugify } from '../../../shared/worktree';
import { dialog, hosts, hubSettings, machinesInfo, toast } from '../state';
import { hub } from '../ws';
import { api } from '../api';

// Ajustes › Máquinas: the machines of the hub (dataDir/hosts.json), added, edited and removed
// here. Adding one: the hub's key goes into its authorized_keys (by hand: a line to paste),
// «Probar» checks the hub gets in, and the hub installs the kit there over SSH. Removing one
// takes the kit and the key off it first.

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast(`${what} copiado`),
    () => toast('No se pudo copiar', 'error'),
  );

const VIAS: [MachineVia, string, string][] = [
  ['direct', 'Directa', 'Por su IP o nombre, en la misma red que el servidor central (LAN o red interna), o con Tailscale en el propio servidor.'],
  ['tailnet', 'Tailnet', 'Por el proxy de Tailscale del servidor central (el contenedor de Tailscale en Docker): su nombre en la tailnet.'],
  ['lan', 'LAN y si no, tailnet', 'Prueba primero su IP de LAN (un segundo) y, si no responde, va por la tailnet. Para un portátil que unas veces está en casa y otras no.'],
];
const VIA_LABEL = Object.fromEntries(VIAS.map(([v, l]) => [v, l])) as Record<MachineVia, string>;

/** An id from a name: what the kit and the settings know the machine by. */
const idFrom = (name: string) => slugify(name).slice(0, 32).replace(/-+$/, '');

/** The command to paste on the machine: adds the hub's key to its authorized_keys, once. */
const authorizeCommand = (line: string) =>
  `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && grep -qxF '${line}' ~/.ssh/authorized_keys || echo '${line}' >> ~/.ssh/authorized_keys`;

/** The machine being added ('new') or edited: the rest of Ajustes › Máquinas hides meanwhile. */
export const machineEditing = signal<SavedHost | 'new' | null>(null);

export function MachinesList() {
  const info = machinesInfo.value;
  const editing = machineEditing.value;
  useEffect(() => () => void (machineEditing.value = null), []);
  if (!info) return null;
  const setEditing = (m: SavedHost | 'new' | null) => (machineEditing.value = m);
  if (editing) return <MachineForm machine={editing === 'new' ? null : editing} close={() => setEditing(null)} />;

  const status = (id: string) => hosts.value.find((h) => h.id === id);
  return (
    <section class="setting">
      <p class="dim small">
        Las que ve el panel. El servidor central entra en cada una por SSH con su clave y les instala el kit, que hace llegar los estados de Claude y los avisos al móvil.
      </p>
      {info.configHostsLeft && (
        <p class="settings-state small">
          La config del servidor central (config.yaml) aún tiene un bloque «hosts», que ya se ignora: estas máquinas salen de aquí. Quítalo de la config cuando puedas.
        </p>
      )}
      <ul class="machine-list">
        {info.list.map((m) => {
          const h = status(m.id);
          const state = h?.status === 'ok' ? 'conectada' : h?.status === 'connecting' ? 'conectando…' : h?.error ? `sin conexión: ${h.error}` : 'sin conexión';
          return (
            <li key={m.id}>
              <span class={`machine-dot ${h?.status === 'ok' ? 'ok' : h?.status === 'connecting' ? '' : 'off'}`} aria-hidden="true" />
              <span class="project-text">
                <span class="project-name">
                  {m.name} <span class="dim small">· {m.id}</span>
                </span>
                <span class="project-hint">
                  {m.local ? 'el propio servidor central' : `${m.ssh} · ${VIA_LABEL[m.via ?? 'direct']}`} · {state}
                  {h?.kit ? ` · kit ${h.kit}` : h?.status === 'ok' ? ' · sin kit' : ''}
                </span>
              </span>
              <button class="btn" onClick={() => setEditing(m)}>
                Editar
              </button>
            </li>
          );
        })}
      </ul>
      <div class="row-btns">
        <button class="btn btn-primary" onClick={() => setEditing('new')}>
          Añadir máquina
        </button>
      </div>
    </section>
  );
}

interface Draft {
  name: string;
  id: string;
  ssh: string;
  via: MachineVia;
  lanAddress: string;
  port: string;
  tmux: string;
  socketName: string;
  sshOptions: string;
}

const draftOf = (m: SavedHost | null): Draft => ({
  name: m?.name ?? '',
  id: m?.id ?? '',
  ssh: m?.ssh ?? '',
  via: m?.via ?? 'direct',
  lanAddress: m?.lanAddress ?? '',
  port: m?.port ? String(m.port) : '',
  tmux: m?.tmux ?? '',
  socketName: m?.socketName ?? '',
  sshOptions: (m?.sshOptions ?? []).join('\n'),
});

const bodyOf = (d: Draft, m: SavedHost | null, local: boolean) => ({
  ...(m?.socketPath ? { socketPath: m.socketPath } : {}),
  ...(local ? { local: true } : {}),
  id: d.id.trim(),
  name: d.name.trim(),
  ssh: d.ssh.trim(),
  via: d.via,
  lanAddress: d.lanAddress.trim(),
  port: d.port.trim(),
  tmux: d.tmux.trim(),
  socketName: d.socketName.trim(),
  sshOptions: d.sshOptions.split('\n').map((s) => s.trim()).filter(Boolean),
});

/** The URL a kit sends its notices to: one of the hub's, or another one typed here. */
function HubUrlPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const urls = hubSettings.value?.hubUrls ?? [];
  const known = urls.includes(value);
  return (
    <label class="folder-name">
      <span class="dim small">Dirección del servidor central para los avisos del kit</span>
      {urls.length > 0 && (
        <select value={known ? value : ''} onChange={(e) => onChange(e.currentTarget.value)}>
          {urls.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value="">Otra…</option>
        </select>
      )}
      {(!known || !urls.length) && (
        <input class="text-input mono" value={value} placeholder="https://…" autocapitalize="off" spellcheck={false} onInput={(e) => onChange(e.currentTarget.value)} />
      )}
      <span class="dim small">La que la máquina alcanza: la pública si llega a ella; si no (una máquina de la red interna), la de notifyListen.</span>
    </label>
  );
}

function KitResult({ title, report }: { title: string; report: KitReport }) {
  return (
    <div class="kit-report">
      <p class={report.ok ? 'small' : 'settings-state small'}>{title}</p>
      {report.log && <pre class="kit-log">{report.log}</pre>}
      {report.left.length > 0 && (
        <>
          <p class="settings-state small">Se ha quedado en la máquina, para limpiarlo a mano si hace falta:</p>
          <ul class="kit-left small">
            {report.left.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CheckResult({ check }: { check: MachineCheck }) {
  return (
    <div class="kit-report small">
      {check.ok ? (
        <p>
          ✓ Entra como {check.user} · {check.system} · tmux {check.tmuxVersion}
          {check.kit ? ` · ya tiene el kit${check.kit.version ? ` ${check.kit.version}` : ''} en ${check.kit.dir} (se pone en la última release)` : ''}
        </p>
      ) : null}
      {check.error && <p class="settings-state">{check.ok ? check.error : `✗ ${check.error}`}</p>}
    </div>
  );
}

function MachineForm({ machine, close }: { machine: SavedHost | null; close: () => void }) {
  const info = machinesInfo.value!;
  const isNew = !machine;
  const [d, setD] = useState<Draft>(draftOf(machine));
  const [idTouched, setIdTouched] = useState(false);
  const [keyLine, setKeyLine] = useState<string | null>(null);
  const [check, setCheck] = useState<MachineCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [install, setInstall] = useState(info.canInstallKit);
  const [url, setUrl] = useState(hubSettings.value?.hubUrls[0] ?? location.origin);
  const [report, setReport] = useState<{ title: string; report: KitReport } | null>(null);
  const set = (patch: Partial<Draft>) => {
    setD((o) => ({ ...o, ...patch }));
    setCheck(null);
  };
  const [hubItself, setHubItself] = useState(false);
  const local = machine?.local === true || hubItself;

  useEffect(() => {
    if (local) return;
    api<{ line: string }>('/api/machines/key', { via: d.via }).then(
      (r) => setKeyLine(r.line),
      () => setKeyLine(null),
    );
  }, [d.via, hubSettings.value?.hubAddresses]);

  const body = bodyOf(d, machine, local);
  const probe = async () => {
    setBusy('check');
    try {
      setCheck(await api<MachineCheck>('/api/machines/check', { machine: body, id: machine?.id }));
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      if (isNew) {
        const r = await api<{ machine: SavedHost; kit?: KitReport }>('/api/machines', { machine: body, install, hubUrl: url });
        toast(`${r.machine.name} añadida`);
        if (r.kit) return setReport({ title: r.kit.ok ? `Kit instalado en ${r.machine.name}.` : `${r.machine.name} está en el panel, pero el kit no se ha podido instalar:`, report: r.kit });
      } else {
        await api(`/api/machines/${encodeURIComponent(machine.id)}`, body);
        toast('Guardado');
      }
      close();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const reinstall = async () => {
    setBusy('kit');
    try {
      const r = await api<KitReport>(`/api/machines/${encodeURIComponent(machine!.id)}/kit`, { hubUrl: url });
      setReport({ title: r.ok ? 'Kit instalado.' : 'No se ha podido instalar el kit:', report: r });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = (force = false) => {
    const m = machine!;
    dialog.value = {
      kind: 'confirm',
      title: `Quitar ${m.name}`,
      message: force
        ? `Se quita solo del panel. En la máquina se quedan el kit, su clon y la clave del servidor central en su authorized_keys.`
        : m.local
          ? `Deja de verse en el panel. Sus carpetas y su comando se olvidan, y sus automatizaciones se desactivan.`
          : `El servidor central entra en ${m.name} y le quita el kit (su bloque de ~/.tmux.conf, sus hooks de Claude, su configuración y el clon, si no tiene cambios) y, por último, su propia clave del authorized_keys. Después deja de verse en el panel: sus carpetas y su comando se olvidan y sus automatizaciones se desactivan. Lo que esté en unos dotfiles compartidos con otras máquinas se deja.`,
      confirm: force ? 'Quitar del panel' : 'Desinstalar y quitar',
      danger: true,
      onSubmit: () => void doRemove(force),
    };
  };
  const doRemove = async (force: boolean) => {
    setBusy('remove');
    try {
      const r = await api<{ kit?: KitReport }>(`/api/machines/${encodeURIComponent(machine!.id)}/delete`, { force });
      toast(`${machine!.name} quitada`);
      if (r.kit && (r.kit.left.length || r.kit.log)) setReport({ title: `${machine!.name} ya no está en el panel.`, report: r.kit });
      else close();
    } catch (err) {
      const kit = (err as { data?: { kit?: KitReport } }).data?.kit;
      if (kit) {
        setReport({ title: 'No se ha podido desinstalar:', report: kit });
        dialog.value = {
          kind: 'confirm',
          title: `${machine!.name} no responde`,
          message: `No se ha podido desinstalar el kit (${kit.log}). ¿La quitas solo del panel? En la máquina se quedarían el kit, su clon y la clave del servidor central.`,
          confirm: 'Quitar del panel',
          danger: true,
          onSubmit: () => void doRemove(true),
        };
      } else toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (report)
    return (
      <section class="setting">
        <h3>{isNew ? 'Añadir máquina' : machine.name}</h3>
        <KitResult title={report.title} report={report.report} />
        <div class="row-btns">
          <button class="btn btn-primary" onClick={close}>
            Hecho
          </button>
        </div>
      </section>
    );

  const field = (label: string, key: keyof Draft, opts: { placeholder?: string; hint?: string; mono?: boolean; disabled?: boolean } = {}) => (
    <label class="folder-name">
      <span class="dim small">{label}</span>
      <input
        class={`text-input ${opts.mono ? 'mono' : ''}`}
        value={d[key]}
        placeholder={opts.placeholder}
        disabled={opts.disabled}
        autocapitalize="off"
        autocomplete="off"
        spellcheck={false}
        onInput={(e) => {
          const v = e.currentTarget.value;
          if (key === 'name' && isNew && !idTouched) set({ name: v, id: idFrom(v) });
          else {
            if (key === 'id') setIdTouched(true);
            set({ [key]: v } as Partial<Draft>);
          }
        }}
      />
      {opts.hint && <span class="dim small">{opts.hint}</span>}
    </label>
  );

  const canSave = isNew ? !!check?.ok && !busy : !busy;
  return (
    <section class="setting machine-form">
      <h3>{isNew ? 'Añadir máquina' : `Editar ${machine.name}`}</h3>
      {field('Nombre', 'name', { placeholder: 'MacBook Air' })}
      {isNew
        ? field('Id', 'id', { mono: true, hint: 'Con él la conoce el kit; no se puede cambiar después.' })
        : <p class="dim small">Id: <code>{machine.id}</code></p>}
      {isNew && (
        <div class="folder-name">
          <label class="kb-check">
            <input
              type="checkbox"
              checked={hubItself}
              onChange={(e) => {
                setHubItself(e.currentTarget.checked);
                setCheck(null);
              }}
            />
            Es el propio servidor central (su tmux, sin SSH)
          </label>
        </div>
      )}
      {local && !isNew && <p class="dim small">Es el propio servidor central: tmux corre en él, sin SSH.</p>}
      {local && isNew && (
        <div class="folder-name">
          <div class="row-btns">
            <button type="button" class="btn" disabled={!!busy} onClick={probe}>
              {busy === 'check' ? 'Probando…' : 'Probar'}
            </button>
          </div>
          {check && <CheckResult check={check} />}
          <label class="kb-check">
            <input type="checkbox" checked={install} disabled={!info.canInstallKit} onChange={(e) => setInstall(e.currentTarget.checked)} />
            Instalar el kit (en ~/tmux-web-bridge, en la última release)
          </label>
          {install && <HubUrlPicker value={url} onChange={setUrl} />}
        </div>
      )}
      {!local && (
        <>
          {field('Destino SSH', 'ssh', { placeholder: 'usuario@maquina', mono: true, hint: 'Su usuario y su nombre (en la tailnet, o en la red) o su IP.' })}
          <div class="folder-name">
            <span class="dim small">Cómo llega el servidor central</span>
            <div class="seg" role="radiogroup" aria-label="Cómo llega">
              {VIAS.map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={d.via === v} class={d.via === v ? 'on' : ''} onClick={() => set({ via: v })}>
                  {label}
                </button>
              ))}
            </div>
            <span class="dim small">{VIAS.find(([v]) => v === d.via)![2]}</span>
          </div>
          {d.via === 'lan' && field('IP de LAN', 'lanAddress', { placeholder: '192.168.1.20', mono: true, hint: 'Mejor fija (reservada en el router).' })}
          <details class="machine-advanced">
            <summary class="small">Opciones avanzadas</summary>
            {field('Puerto SSH', 'port', { placeholder: '22', mono: true })}
            {field('Ruta de tmux', 'tmux', { placeholder: 'tmux', mono: true, hint: 'Solo si no se encuentra solo (Homebrew y /usr/local ya se buscan).' })}
            {field('Socket de tmux', 'socketName', { placeholder: '(el de siempre)', mono: true, hint: 'Para un servidor de tmux aparte (tmux -L nombre).' })}
            <label class="folder-name">
              <span class="dim small">Más opciones de SSH, una por línea (Clave=valor)</span>
              <textarea class="text-input mono" rows={3} value={d.sshOptions} spellcheck={false} onInput={(e) => set({ sshOptions: e.currentTarget.value })} />
            </label>
          </details>

          <div class="folder-name">
            <span class="dim small">{isNew ? '1. ' : ''}La clave del servidor central, en su ~/.ssh/authorized_keys</span>
            {keyLine ? (
              <>
                <code class="ext-token">{keyLine}</code>
                <span class="dim small">
                  Pega esto en una terminal de la máquina (lo añade si no está). Solo se acepta desde las direcciones del servidor central para esta vía
                  {keyLine.startsWith('from=') ? '' : ': sin direcciones en «Conexión con las máquinas», desde cualquiera'}.
                </span>
                <div class="row-btns">
                  <button type="button" class="btn" onClick={() => copy(authorizeCommand(keyLine), 'Comando')}>
                    Copiar el comando
                  </button>
                  <button type="button" class="btn" onClick={() => copy(keyLine, 'Línea')}>
                    Copiar solo la línea
                  </button>
                </div>
              </>
            ) : (
              <p class="settings-state small">El servidor central no tiene clave SSH: créala con ssh-keygen (~/.ssh/id_ed25519).</p>
            )}
          </div>

          <div class="folder-name">
            <span class="dim small">{isNew ? '2. ' : ''}Comprobar que entra</span>
            <div class="row-btns">
              <button type="button" class="btn" disabled={!!busy || !d.ssh.trim()} onClick={probe}>
                {busy === 'check' ? 'Probando…' : 'Probar'}
              </button>
            </div>
            {check && <CheckResult check={check} />}
          </div>

          {isNew ? (
            <div class="folder-name">
              <label class="kb-check">
                <input type="checkbox" checked={install} disabled={!info.canInstallKit} onChange={(e) => setInstall(e.currentTarget.checked)} />
                3. Instalar el kit (en ~/tmux-web-bridge, en la última release)
              </label>
              {!info.canInstallKit && <span class="settings-state small">El servidor central no tiene notifyToken en su config: sin él, el kit no podría avisar.</span>}
              {install && <HubUrlPicker value={url} onChange={setUrl} />}
            </div>
          ) : (
            <details class="machine-advanced">
              <summary class="small">Reinstalar el kit</summary>
              <HubUrlPicker value={url} onChange={setUrl} />
              <div class="row-btns">
                <button type="button" class="btn" disabled={!!busy || !info.canInstallKit} onClick={reinstall}>
                  {busy === 'kit' ? 'Instalando…' : 'Reinstalar el kit'}
                </button>
              </div>
            </details>
          )}
        </>
      )}

      <div class="row-btns">
        {!isNew && (
          <button type="button" class="btn btn-danger" disabled={!!busy} onClick={() => remove()}>
            {busy === 'remove' ? 'Quitando…' : 'Quitar'}
          </button>
        )}
        <span class="spacer" />
        <button type="button" class="btn" disabled={busy === 'save'} onClick={close}>
          Cancelar
        </button>
        <button type="button" class="btn btn-primary" disabled={!canSave} title={isNew && !check?.ok ? 'Antes, «Probar»' : undefined} onClick={save}>
          {busy === 'save' ? (isNew && install ? 'Añadiendo e instalando…' : 'Guardando…') : isNew ? 'Añadir' : 'Guardar'}
        </button>
      </div>
    </section>
  );
}

/** The hub's addresses (for the from= of its key) and its URLs (for the kits' notices). */
export function HubConnection() {
  const s = hubSettings.value;
  const [a, setA] = useState<HubAddresses | null>(s?.hubAddresses ?? null);
  const [urls, setUrls] = useState((s?.hubUrls ?? []).join('\n'));
  useEffect(() => {
    if (s) setA(s.hubAddresses);
  }, [s?.hubAddresses]);
  useEffect(() => {
    if (s) setUrls(s.hubUrls.join('\n'));
  }, [s?.hubUrls.join('\n')]);
  if (!s || !a) return null;
  const saveAddresses = () => hub.send({ t: 'settings', settings: { hubAddresses: a } });
  const saveUrls = () => hub.send({ t: 'settings', settings: { hubUrls: urls.split('\n').map((u) => u.trim()).filter(Boolean) } });
  const addr = (key: keyof HubAddresses, label: string, hint: string) => (
    <label class="folder-name">
      <span class="dim small">{label}</span>
      <input
        class="text-input mono"
        value={a[key]}
        placeholder="(ninguna)"
        autocapitalize="off"
        spellcheck={false}
        onInput={(e) => setA({ ...a, [key]: e.currentTarget.value })}
        onBlur={saveAddresses}
      />
      <span class="dim small">{hint}</span>
    </label>
  );
  return (
    <section class="setting">
      <h3>Conexión con las máquinas</h3>
      <p class="dim small">
        Desde dónde llega el servidor central a las máquinas: la clave que se pega en cada una solo se acepta desde esas direcciones (from=). Vacías, desde cualquiera.
      </p>
      {addr('tailnet', 'Su IP en la tailnet', 'Para las máquinas a las que llega por la tailnet.')}
      {addr('lan', 'Su IP en la LAN', 'La que ven las máquinas de casa al llegarles por la LAN.')}
      {addr('internal', 'Su IP en la red interna', 'Para las máquinas de su misma red (los CTs del servidor, por ejemplo).')}
      <label class="folder-name">
        <span class="dim small">Sus direcciones para los avisos del kit, una por línea</span>
        <textarea class="text-input mono" rows={2} value={urls} spellcheck={false} onInput={(e) => setUrls(e.currentTarget.value)} onBlur={saveUrls} />
        <span class="dim small">Las que se ofrecen al instalar el kit en una máquina: la pública y, para las que no llegan a ella, la de notifyListen (http://…:7682).</span>
      </label>
    </section>
  );
}
