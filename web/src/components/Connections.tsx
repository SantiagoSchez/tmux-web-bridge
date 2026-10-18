import { auth } from '../auth';
import { useEffect, useState } from 'preact/hooks';
import type { ConnectionInfo } from '../../../shared/types';
import { clientId, connections, findWindow, hosts, sheet } from '../state';
import { Sheet } from './Dialogs';

function browser(ua = ''): string {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const name = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|ws/i.test(ua) ? 'Script' : 'Navegador';
  return os ? `${name} · ${os}` : name;
}

function since(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h ${m % 60} min`;
  return `hace ${Math.floor(h / 24)} d`;
}

function viewing(c: ConnectionInfo): string {
  const v = c.view;
  if (!v) return 'En la lista';
  const host = hosts.value.find((h) => h.id === v.host);
  const w = v.window ? findWindow(v.host, v.window) : null;
  const where = w ? `${w.session.name} › ${w.window.name}` : (host?.name ?? v.host);
  return `${hosts.value.length > 1 && host ? host.name + ' › ' : ''}${where}`;
}

/** Everyone connected to the panel right now. A security check: you should recognise every row. */
export function Connections() {
  const [now, setNow] = useState(Date.now());
  const open = sheet.value === 'connections';
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [open]);
  if (!open) return null;
  const list = connections.value;
  const me = clientId.value;
  return (
    <Sheet
      title={`${list.length} ${list.length === 1 ? 'conexión activa' : 'conexiones activas'}`}
      subtitle="Cada pestaña o app abierta del panel cuenta como una conexión."
      onClose={() => (sheet.value = null)}
    >
      <ul class="conn-list">
        {list.map((c) => (
          <li key={c.id} class={`conn ${c.id === me ? 'me' : ''}`}>
            <div class="conn-top">
              <span class="conn-device">{c.device ?? c.ip ?? 'Desconocido'}</span>
              {c.id === me && <span class="pill">este dispositivo</span>}
              {c.present && <span class="pill">en uso</span>}
              {!c.visible && <span class="pill pill-dim">en segundo plano</span>}
            </div>
            <div class="conn-meta">
              {c.userName || c.login || (auth.value?.method === 'password' ? 'con contraseña' : 'sin identidad de Tailscale')}
              {c.login && c.userName ? ` (${c.login})` : ''}
            </div>
            <div class="conn-meta">
              {browser(c.userAgent)} · {c.ip ?? '—'}
            </div>
            <div class="conn-meta">
              Conectado {since(c.connectedAt, now)} · {viewing(c)}
              {c.terminals > 0 ? ` · ${c.terminals} terminal${c.terminals > 1 ? 'es' : ''}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
