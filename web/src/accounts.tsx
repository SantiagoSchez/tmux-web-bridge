import type { ClaudeAccount } from '../../shared/types';
import { accountsInfo, dialog, hosts, toast, type MenuItem } from './state';
import { hub } from './ws';

// The Claude accounts the hub keeps: switching a machine to one, and their menu.

function hostName(id: string): string {
  return hosts.value.find((h) => h.id === id)?.name ?? id;
}

/**
 * Makes `acc` the account of the machine's Claude Code (the running ones pick it up
 * on their own). Without a spare login of it, it asks for one first and switches after.
 */
export async function useAccount(hostId: string, acc: ClaudeAccount): Promise<void> {
  try {
    await hub.account({ op: 'switch', account: acc.id, host: hostId });
    toast(`${hostName(hostId)} usa ahora ${acc.alias}`);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'needsLogin') {
      toast(`Para usar ${acc.alias} también en ${hostName(hostId)} hace falta otro inicio de sesión con ella`);
      dialog.value = { kind: 'claudeLogin', host: hostId, account: acc.id };
    } else toast(e.message, 'error');
  }
}

/** Adds an account (or another login of one) with a Claude login made from the panel. */
export function addAccount(): void {
  dialog.value = { kind: 'claudeLogin' };
}

function rename(acc: ClaudeAccount): void {
  dialog.value = {
    kind: 'prompt',
    title: 'Renombrar la cuenta',
    label: acc.email,
    value: acc.alias,
    confirm: 'Guardar',
    onSubmit: (alias) => {
      if (!alias || alias === acc.alias) return;
      hub.account({ op: 'rename', account: acc.id, alias }).catch((e: Error) => toast(e.message, 'error'));
    },
  };
}

function remove(acc: ClaudeAccount): void {
  dialog.value = {
    kind: 'confirm',
    title: `¿Quitar ${acc.alias}?`,
    message: `El hub olvida sus inicios de sesión guardados (${acc.email}). Para volver a usarla habrá que iniciar sesión otra vez.`,
    confirm: 'Quitar',
    danger: true,
    onSubmit: () => void hub.account({ op: 'remove', account: acc.id }).catch((e: Error) => toast(e.message, 'error')),
  };
}

/** Whether a machine can be switched now: connected and not already switching. */
function canSwitch(hostId: string): boolean {
  const h = hosts.value.find((x) => x.id === hostId);
  return h?.status === 'ok' && !(accountsInfo.value?.switching ?? []).includes(hostId);
}

/**
 * The machines that do not use the account yet, to pick one: a list only this step
 * needs. The open window's machine comes first.
 */
function pickHost(acc: ClaudeAccount, here?: string): void {
  const free = hosts.value.filter((h) => !acc.activeOn.includes(h.id));
  dialog.value = {
    kind: 'menu',
    title: `Usar ${acc.alias} en…`,
    items: [...free.filter((h) => h.id === here), ...free.filter((h) => h.id !== here)].map((h) => ({
      label: h.id === here ? `${h.name} (esta ventana)` : h.name,
      icon: h.id === here ? '●' : '○',
      disabled: !canSwitch(h.id),
      run: () => void useAccount(h.id, acc),
    })),
  };
}

/**
 * An account's menu: where it is in use (as tags, however many machines there are),
 * switching a machine to it (picked in a second step), and rename, add, remove.
 */
export function accountMenu(acc: ClaudeAccount, here?: string): void {
  const items: MenuItem[] = [];
  if (hosts.value.some((h) => !acc.activeOn.includes(h.id))) items.push({ label: 'Usar en una máquina…', icon: '○', run: () => pickHost(acc, here) });
  if (acc.needsLogin) items.push({ label: 'Iniciar sesión otra vez', icon: '↻', run: () => (dialog.value = { kind: 'claudeLogin', account: acc.id }) });
  items.push(
    { label: 'Renombrar', icon: '✎', run: () => rename(acc) },
    { label: 'Añadir otra cuenta', icon: '＋', run: addAccount },
    { label: 'Quitar del hub', icon: '✕', danger: true, disabled: acc.activeOn.length > 0, run: () => remove(acc) },
  );
  const spare = acc.spare ? ` · ${acc.spare === 1 ? '1 sesión libre' : `${acc.spare} sesiones libres`}` : '';
  const top = (
    <div class="account-hosts">
      <span class="account-hosts-label">{acc.activeOn.length ? 'En uso en' : 'Sin usar en ninguna máquina'}</span>
      {acc.activeOn.map((id) => (
        <span key={id} class={`pill ${id === here ? 'pill-alert' : ''}`}>
          {hostName(id)}
        </span>
      ))}
    </div>
  );
  dialog.value = { kind: 'menu', title: acc.alias, subtitle: `${acc.email}${acc.plan ? ` · ${acc.plan}` : ''}${spare}`, top, items };
}
