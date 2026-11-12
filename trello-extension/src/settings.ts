import type { Memory, Settings } from './types';

const DEFAULTS: Settings = { hubUrl: '', hubToken: '' };

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  const saved = (settings ?? {}) as Partial<Settings>;
  return { hubUrl: saved.hubUrl ?? DEFAULTS.hubUrl, hubToken: saved.hubToken ?? DEFAULTS.hubToken };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export async function loadMemory(): Promise<Memory> {
  const { memory } = await chrome.storage.local.get('memory');
  const m = (memory ?? {}) as Partial<Memory>;
  return { boards: m.boards ?? {}, skipPermissions: m.skipPermissions === true, worktree: m.worktree === true };
}

export async function saveMemory(memory: Memory): Promise<void> {
  await chrome.storage.local.set({ memory });
}

/** The match pattern of the panel's origin, for chrome.permissions. */
export function hubPattern(hubUrl: string): string {
  return `${new URL(hubUrl).origin}/*`;
}
