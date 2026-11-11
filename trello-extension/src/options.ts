import { DEFAULT_TEMPLATE, normalizeHubUrl } from './logic';
import { hubPattern, loadSettings, saveSettings } from './settings';
import type { Settings } from './types';

const FIELDS = ['hubUrl', 'hubToken', 'trelloKey', 'trelloToken', 'promptTemplate'] as const;
const input = (id: (typeof FIELDS)[number]) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
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

async function checkTrello(s: Settings): Promise<[boolean, string]> {
  try {
    const res = await fetch('https://api.trello.com/1/members/me?fields=username,fullName', {
      headers: { Authorization: `OAuth oauth_consumer_key="${s.trelloKey}", oauth_token="${s.trelloToken}"` },
    });
    if (!res.ok) return [false, `Trello no acepta la API key o el token (${res.status}).`];
    const me = (await res.json()) as { username: string; fullName: string };
    return [true, `Trello: conectado como ${me.fullName} (@${me.username}).`];
  } catch {
    return [false, 'No se pudo conectar con la API de Trello.'];
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
  if (!values.hubToken || !values.trelloKey || !values.trelloToken) {
    report([[false, 'Faltan campos por rellenar.']]);
    return;
  }
  values.promptTemplate ||= DEFAULT_TEMPLATE;

  // Asked here, on the click: Chrome only shows the permission prompt after a user gesture.
  const origins = [hubPattern(values.hubUrl)];
  const granted = (await chrome.permissions.contains({ origins })) || (await chrome.permissions.request({ origins }).catch(() => false));
  await saveSettings(values);
  input('hubUrl').value = values.hubUrl;
  input('promptTemplate').value = values.promptTemplate;
  if (!granted) {
    report([[false, `Guardado, pero sin permiso para llegar a ${new URL(values.hubUrl).origin}: la extensión no podrá hablar con twb.`]]);
    return;
  }
  button.disabled = true;
  report([[true, 'Guardado. Probando…']]);
  const results = await Promise.all([checkHub(values), checkTrello(values)]);
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
