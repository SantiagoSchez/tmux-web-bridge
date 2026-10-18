import { useState } from 'preact/hooks';
import { auth, signedIn } from '../auth';

/**
 * Password screen, when the hub is published without Tailscale identity. With
 * two-step verification on, a right password asks for the authenticator code next.
 */
export function Login() {
  const [password, setPassword] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expired = auth.value?.expired;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!password || (needCode && !code.trim()) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needCode ? { password, code } : { password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.needCode && !needCode) return setNeedCode(true);
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      signedIn();
    } catch (err) {
      setError((err as Error).message);
      if (needCode) setCode('');
      else setPassword('');
    } finally {
      setBusy(false);
    }
  };

  if (needCode) {
    return (
      <div class="login">
        <form class="login-card" onSubmit={submit}>
          <h1 class="brand-name">twb</h1>
          <p class="dim">{recovery ? 'Escribe uno de tus códigos de recuperación.' : 'Escribe el código de tu app de autenticación.'}</p>
          <input
            key={recovery ? 'recovery' : 'totp'}
            class="text-input login-code"
            name="code"
            autoComplete={recovery ? 'off' : 'one-time-code'}
            inputMode={recovery ? 'text' : 'numeric'}
            autocapitalize="off"
            spellcheck={false}
            placeholder={recovery ? 'xxxxx-xxxxx' : '123456'}
            aria-label={recovery ? 'Código de recuperación' : 'Código de verificación'}
            value={code}
            onInput={(e) => setCode(e.currentTarget.value)}
            autoFocus
          />
          {error && (
            <p class="login-error" role="alert">
              {error}
            </p>
          )}
          <button class="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
            {busy ? 'Comprobando…' : 'Entrar'}
          </button>
          <button
            type="button"
            class="link-btn"
            onClick={() => {
              setRecovery(!recovery);
              setCode('');
              setError(null);
            }}
          >
            {recovery ? 'Usar la app de autenticación' : 'Usar un código de recuperación'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div class="login">
      <form class="login-card" onSubmit={submit}>
        <h1 class="brand-name">twb</h1>
        <p class="dim">{expired ? 'Tu sesión ha terminado. Vuelve a entrar.' : 'Tus sesiones de tmux.'}</p>
        {/* For password managers: they save a password against a user name. */}
        <input type="text" name="username" value="twb" autoComplete="username" hidden readOnly />
        <input
          class="text-input"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          aria-label="Contraseña"
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
          autoFocus
        />
        {error && (
          <p class="login-error" role="alert">
            {error}
          </p>
        )}
        <button class="btn btn-primary" type="submit" disabled={busy || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
