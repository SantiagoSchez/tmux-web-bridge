import { useEffect, useState } from 'preact/hooks';
import { dialog, toast } from '../state';

type Status = { enabled: boolean; recoveryLeft: number };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

/** "ABCD EFGH ...": easier to type into an authenticator by hand. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)!.join(' ');

/** Settings › two-step verification of the password login (TOTP with a QR, plus recovery codes). */
export function TwoFactorSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; svg: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api<Status>('/api/2fa').then(setStatus, () => setStatus(null));
  useEffect(() => void refresh(), []);

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api('/api/2fa/setup', {}));
      setCode('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: Event) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api<{ recoveryCodes: string[] }>('/api/2fa/enable', { code });
      setSetup(null);
      setCodes(res.recoveryCodes);
      await refresh();
      toast('Verificación en dos pasos activada');
    } catch (err) {
      toast((err as Error).message, 'error');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  /** Disabling and new recovery codes both ask for a current code first. */
  const withCode = (title: string, confirmLabel: string, run: (code: string) => Promise<void>) => {
    dialog.value = {
      kind: 'prompt',
      title,
      label: 'Código de tu app de autenticación o un código de recuperación',
      value: '',
      placeholder: '123456',
      confirm: confirmLabel,
      onSubmit: (v) => {
        if (v) run(v).catch((err: Error) => toast(err.message, 'error'));
      },
    };
  };

  const disable = () =>
    withCode('Desactivar la verificación en dos pasos', 'Desactivar', async (c) => {
      await api('/api/2fa/disable', { code: c });
      setCodes(null);
      await refresh();
      toast('Verificación en dos pasos desactivada');
    });

  const regenerate = () =>
    withCode('Códigos de recuperación nuevos', 'Generar', async (c) => {
      const res = await api<{ recoveryCodes: string[] }>('/api/2fa/recovery', { code: c });
      setCodes(res.recoveryCodes);
      await refresh();
    });

  const copy = () =>
    navigator.clipboard.writeText(codes!.join('\n')).then(
      () => toast('Códigos copiados'),
      () => toast('No se pudieron copiar', 'error'),
    );

  if (!status) return null;
  return (
    <section class="settings-group">
      <h3>Verificación en dos pasos</h3>
      <p class="dim small">Al entrar, además de la contraseña, se pide el código de una app de autenticación (Google Authenticator, 1Password, Authy…).</p>

      {codes ? (
        <>
          <p class="settings-state">
            Guarda estos códigos de recuperación en un lugar seguro. Cada uno sirve una sola vez para entrar si pierdes el móvil, y no se volverán a mostrar.
          </p>
          <ul class="recovery-codes">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div class="row-btns">
            <button class="btn" onClick={copy}>
              Copiar
            </button>
            <button class="btn btn-primary" onClick={() => setCodes(null)}>
              Ya los he guardado
            </button>
          </div>
        </>
      ) : setup ? (
        <form onSubmit={confirm}>
          <p class="settings-state">Escanea el código con tu app de autenticación y escribe el código de 6 cifras que te muestre.</p>
          <div class="totp-qr" dangerouslySetInnerHTML={{ __html: setup.svg }} />
          <p class="dim small">
            ¿No puedes escanearlo? Escribe esta clave a mano: <code class="totp-secret">{grouped(setup.secret)}</code>
          </p>
          <input
            class="text-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label="Código de verificación"
            value={code}
            onInput={(e) => setCode(e.currentTarget.value)}
          />
          <p class="dim small">Al activarla se cierran las sesiones de los demás dispositivos: tendrán que entrar con la contraseña y el código.</p>
          <div class="row-btns">
            <button type="button" class="btn" onClick={() => setSetup(null)}>
              Cancelar
            </button>
            <button type="submit" class="btn btn-primary" disabled={busy || !code.trim()}>
              Activar
            </button>
          </div>
        </form>
      ) : status.enabled ? (
        <>
          <p class="settings-state">
            Activada. Te quedan {status.recoveryLeft} {status.recoveryLeft === 1 ? 'código' : 'códigos'} de recuperación.
          </p>
          <div class="row-btns">
            <button class="btn" onClick={regenerate}>
              Códigos de recuperación nuevos
            </button>
            <button class="btn" onClick={disable}>
              Desactivar
            </button>
          </div>
        </>
      ) : (
        <>
          <p class="settings-state">Desactivada.</p>
          <div class="row-btns">
            <button class="btn btn-primary" onClick={start} disabled={busy}>
              Activar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
