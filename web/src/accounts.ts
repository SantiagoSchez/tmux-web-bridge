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

/** An account's menu: which machines use it (a tap switches one), rename, remove, add another. */
export function accountMenu(acc: ClaudeAccount): void {
  const switching = accountsInfo.value?.switching ?? [];
  const items: MenuItem[] = hosts.value.map((h) => {
    const active = acc.activeOn.includes(h.id);
    return {
      label: active ? `En uso en ${h.name}` : `Usar en ${h.name}`,
      icon: active ? '●' : '○',
      disabled: active || h.status !== 'ok' || switching.includes(h.id),
      run: () => void useAccount(h.id, acc),
    };
  });
  if (acc.needsLogin) items.push({ label: 'Iniciar sesión otra vez', icon: '↻', run: () => (dialog.value = { kind: 'claudeLogin', account: acc.id }) });
  items.push(
    { label: 'Renombrar', icon: '✎', run: () => rename(acc) },
    { label: 'Añadir otra cuenta', icon: '＋', run: addAccount },
    { label: 'Quitar del hub', icon: '✕', danger: true, disabled: acc.activeOn.length > 0, run: () => remove(acc) },
  );
  const spare = acc.spare ? ` · ${acc.spare === 1 ? '1 sesión libre' : `${acc.spare} sesiones libres`}` : '';
  dialog.value = { kind: 'menu', title: acc.alias, subtitle: `${acc.email}${acc.plan ? ` · ${acc.plan}` : ''}${spare}`, items };
}
