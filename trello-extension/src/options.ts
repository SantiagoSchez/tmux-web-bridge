import { normalizeHubUrl } from './logic';
import { hubPattern, loadSettings, saveSettings } from './settings';
import type { Settings } from './types';

const FIELDS = ['hubUrl', 'hubToken'] as const;
const input = (id: (typeof FIELDS)[number]) => document.getElementById(id) as HTMLInputElement;
const form = document.getElementById('form') as HTMLFormElement;
const status = document.getElementById('status') as HTMLUListElement;
const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;

function report(lines: [ok: boolean, text: string][]): void {
  status.replaceChildren(
    ...lines.map(([ok, text]) => {
      const li = document.createElement('li');
      li.className = ok ? 'ok' : 'err';
      li.textContent = `${ok ? '✓' : '✗'} ${text}`;
      return li;
    }),
  );
}

async function checkHub(s: Settings): Promise<[boolean, string]> {
  try {
    const res = await fetch(`${s.hubUrl}/api/ext/ping`, { headers: { Authorization: `Bearer ${s.hubToken}` } });
    if (res.status === 401) return [false, 'twb no acepta el token: genera otro en Ajustes › Trello.'];
    if (!res.ok) return [false, `twb contesta con un error ${res.status}.`];
    return [true, 'twb: conectado.'];
  } catch {
    return [false, `No se pudo conectar con ${s.hubUrl}. ¿Estás en la tailnet o en la LAN?`];
  }
}

/** Whether the panel has a Trello account: without it, the dialog cannot read the card. */
async function checkTrello(s: Settings): Promise<[boolean, string]> {
  try {
    const res = await fetch(`${s.hubUrl}/api/ext/trello`, { headers: { Authorization: `Bearer ${s.hubToken}` } });
    if (res.status === 404) return [false, 'El panel de twb es anterior a la versión 1.18 de la extensión: actualízalo.'];
    if (!res.ok) return [false, `twb contesta con un error ${res.status} sobre Trello.`];
    const info = (await res.json()) as { configured: boolean; member?: string; error?: string };
    if (!info.configured) return [false, 'El panel no tiene cuenta de Trello: añádela en ⚙️ Ajustes › Trello.'];
    if (info.error) return [false, `Trello (en el panel): ${info.error}`];
    return [true, `Trello (en el panel): ${info.member}.`];
  } catch {
    return [false, 'No se pudo preguntar al panel por Trello.'];
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = Object.fromEntries(FIELDS.map((f) => [f, input(f).value.trim()])) as unknown as Settings;
  try {
    values.hubUrl = normalizeHubUrl(values.hubUrl);
  } catch {
    report([[false, 'La dirección del panel no es válida (por ejemplo, https://twb.example.com).']]);
    return;
  }
  if (!values.hubToken) {
    report([[false, 'Falta el token de la extensión.']]);
    return;
  }

  // Asked here, on the click: Chrome only shows the permission prompt after a user gesture.
  const origins = [hubPattern(values.hubUrl)];
  const granted = (await chrome.permissions.contains({ origins })) || (await chrome.permissions.request({ origins }).catch(() => false));
  await saveSettings(values);
  input('hubUrl').value = values.hubUrl;
  if (!granted) {
    report([[false, `Guardado, pero sin permiso para llegar a ${new URL(values.hubUrl).origin}: la extensión no podrá hablar con twb.`]]);
    return;
  }
  button.disabled = true;
  report([[true, 'Guardado. Probando…']]);
  const hubOk = await checkHub(values);
  const results = hubOk[0] ? [hubOk, await checkTrello(values)] : [hubOk];
  report([[true, 'Guardado.'], ...results]);
  button.disabled = false;
});

void loadSettings().then((s) => {
  for (const f of FIELDS) input(f).value = s[f];
});

// A newer version on disk (the kit downloaded it): it loads with the reload button of its card.
void chrome.runtime.sendMessage({ type: 'update' }).then((reply: { ok: boolean; data?: { version: string | null } }) => {
  const version = reply?.ok ? reply.data?.version : null;
  if (!version) return;
  (document.getElementById('update-text') as HTMLElement).textContent =
    `Versión ${version} lista (tienes la ${chrome.runtime.getManifest().version}): recárgala con el botón de su tarjeta en chrome://extensions, o reinicia Chrome.`;
  document.getElementById('update-open')!.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'openExtensions' }));
  (document.getElementById('update') as HTMLElement).hidden = false;
});
