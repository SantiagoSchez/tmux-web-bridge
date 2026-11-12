import { useEffect, useState } from 'preact/hooks';
import type { ExtTokenInfo, HostInfo } from '../../../shared/types';
import { dialog, hosts, hubSettings, toast } from '../state';
import { newer } from '../updates';
import { hub } from '../ws';

async function api<T>(path: string, post = false): Promise<T> {
  const res = await fetch(path, post ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

const since = (t?: number) => (t ? new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/**
 * Settings › Trello: the token of the browser extension that launches a Claude on a
 * Trello card. Shown once, when made; the hub keeps only its hash.
 */
export function ExtTokenSettings() {
  const [info, setInfo] = useState<ExtTokenInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ExtTokenInfo>('/api/ext-token').then(setInfo, () => setInfo(null));
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api<{ token: string; info: ExtTokenInfo }>('/api/ext-token', true);
      setToken(res.token);
      setInfo(res.info);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmGenerate = () => {
    if (!info?.active) return void generate();
    dialog.value = {
      kind: 'confirm',
      title: '¿Generar otro token?',
      message: 'El token actual dejará de funcionar: tendrás que pegar el nuevo en las opciones de la extensión.',
      confirm: 'Generar otro',
      onSubmit: () => void generate(),
    };
  };

  const revoke = () => {
    dialog.value = {
      kind: 'confirm',
      title: '¿Revocar el token?',
      message: 'La extensión de Trello dejará de poder lanzar tareas hasta que generes otro.',
      confirm: 'Revocar',
      danger: true,
      onSubmit: () => {
        api<ExtTokenInfo>('/api/ext-token/revoke', true).then(
          (i) => {
            setInfo(i);
            setToken(null);
            toast('Token revocado');
          },
          (err: Error) => toast(err.message, 'error'),
        );
      },
    };
  };

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast(`${what} copiado`),
      () => toast('No se pudo copiar', 'error'),
    );

  if (!info) return null;
  return (
    <section class="setting">
      <h3>Extensión de Trello</h3>
      <p class="dim small">
        La extensión de Chrome añade a cada tarjeta de Trello un botón que lanza un Claude con ella en la máquina y el espacio que elijas, y la mueve a Doing. Se conecta a este
        panel con su propio token: pégalo en las opciones de la extensión junto con la dirección del panel.
      </p>

      {token ? (
        <>
          <p class="settings-state">Copia el token ahora: no se volverá a mostrar.</p>
          <code class="ext-token">{token}</code>
          <p class="dim small">
            Dirección del panel: <code>{location.origin}</code>
          </p>
          <div class="row-btns">
            <button class="btn" onClick={() => copy(location.origin, 'Dirección')}>
              Copiar dirección
            </button>
            <button class="btn btn-primary" onClick={() => copy(token, 'Token')}>
              Copiar token
            </button>
          </div>
        </>
      ) : (
        <p class="settings-state">{info.active ? `Hay un token activo desde el ${since(info.createdAt)}.` : 'Sin token: la extensión no puede lanzar tareas.'}</p>
      )}

      <div class="row-btns">
        {info.active && (
          <button class="btn" onClick={revoke} disabled={busy}>
            Revocar
          </button>
        )}
        <button class={`btn ${info.active ? '' : 'btn-primary'}`} onClick={confirmGenerate} disabled={busy}>
          {info.active ? 'Generar otro' : 'Generar token'}
        </button>
      </div>
    </section>
  );
}

/** The first kit whose install.sh downloads the Trello extension (--trello-extension). */
const TRELLO_KIT = '1.17.0';

/**
 * Settings › Trello: the machines whose kit downloads the extension of its release (and
 * again on every update), into a folder to load once in chrome://extensions.
 */
export function TrelloMachines() {
  const list = hosts.value;
  const on = hubSettings.value?.trelloExtension ?? {};
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (h: HostInfo, want: boolean) => {
    setBusy(h.id);
    try {
      const res = await hub.action<{ dir: string | null }>(h.id, { op: 'trelloExtension', on: want });
      toast(want ? `Extensión descargada en ${h.name}: ${res.dir}` : `${h.name} ya no pone al día la extensión`);
    } catch {
      // the error is already a toast
    } finally {
      setBusy(null);
    }
  };
  const copy = (dir: string) =>
    navigator.clipboard.writeText(dir).then(
      () => toast('Carpeta copiada'),
      () => toast('No se pudo copiar', 'error'),
    );

  return (
    <section class="setting">
      <h3>Instalarla en las máquinas</h3>
      <p class="dim small">
        En la máquina donde usas Chrome, el kit descarga la extensión de su versión y la pone al día en cada actualización. Cárgala una vez en{' '}
        <code>chrome://extensions</code> › <strong>Cargar descomprimida</strong>, eligiendo su carpeta: cuando haya otra versión, la extensión avisa y se recarga
        con un clic (o al reiniciar Chrome).
      </p>
      <ul class="trello-hosts">
        {list.map((h) => {
          const dir = on[h.id];
          const oldKit = !h.kit || newer(TRELLO_KIT, h.kit);
          const why = h.status !== 'ok' ? 'Sin conexión.' : oldKit && !dir ? `Necesita el kit ${TRELLO_KIT} o posterior: actualízalo desde el menú de la máquina.` : null;
          return (
            <li key={h.id}>
              <div class="trello-host">
                <span class="trello-host-text">
                  <span class="project-name">{h.name}</span>
                  {dir ? (
                    <span class="project-hint">{dir}</span>
                  ) : (
                    why && <span class="project-hint">{why}</span>
                  )}
                </span>
                {dir && (
                  <button class="btn" onClick={() => void copy(dir)}>
                    Copiar carpeta
                  </button>
                )}
                <button
                  class={`switch ${dir ? 'on' : ''}`}
                  role="switch"
                  aria-checked={!!dir}
                  aria-label={`Extensión de Trello en ${h.name}`}
                  disabled={busy !== null || (!dir && !!why)}
                  onClick={() => void toggle(h, !dir)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
