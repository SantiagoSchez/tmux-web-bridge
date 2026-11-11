import { DEFAULT_TEMPLATE } from './logic';
import type { Memory, Settings } from './types';

const DEFAULTS: Settings = { hubUrl: '', hubToken: '', trelloKey: '', trelloToken: '', promptTemplate: DEFAULT_TEMPLATE };

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export async function loadMemory(): Promise<Memory> {
  const { memory } = await chrome.storage.local.get('memory');
  const m = (memory ?? {}) as Partial<Memory>;
  return { boards: m.boards ?? {}, skipPermissions: m.skipPermissions === true };
}

export async function saveMemory(memory: Memory): Promise<void> {
  await chrome.storage.local.set({ memory });
}

/** The match pattern of the panel's origin, for chrome.permissions. */
export function hubPattern(hubUrl: string): string {
  return `${new URL(hubUrl).origin}/*`;
}
