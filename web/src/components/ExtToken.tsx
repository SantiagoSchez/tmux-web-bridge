import { useEffect, useState } from 'preact/hooks';
import type { ExtTokenInfo } from '../../../shared/types';
import { dialog, toast } from '../state';

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
        La extensión de Chrome añade a cada tarjeta de Trello un botón que lanza un Claude con ella en la máquina y el space que elijas, y la mueve a Doing. Se conecta a este
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
