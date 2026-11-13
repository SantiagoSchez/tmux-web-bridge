import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DICTATION_SHORTCUT, DICTATION_TIMEOUTS, parseShortcut, serializeShortcut } from '../../shared/dictation.js';
import { baseName, DEFAULT_COMMAND, sameFolder, sanitizeCommand, sanitizeFolderList } from '../../shared/folders.js';
import { DEFAULT_KEYBAR, KEYBAR_SCALE_DEFAULT, sanitizeKeybar, sanitizeKeybarScale } from '../../shared/keybar.js';
import { DEFAULT_TEMPLATE } from '../../shared/trello.js';
import type { HubAddresses, HubSettings } from '../../shared/types.js';

/** What a glossary starts with: the terms of working with Claude Code, git and this homelab. */
export const DEFAULT_GLOSSARY = [
  'tmux', 'twb', 'Claude', 'Claude Code', 'pnpm', 'npm', 'git', 'commit', 'push', 'pull', 'rebase', 'merge', 'branch', 'master',
  'worktree', 'deploy', 'release', 'Docker', 'compose', 'TypeScript', 'typecheck', 'README', 'CLAUDE.md', 'hub', 'kit',
  'Tailscale', 'SSH', 'Proxmox', 'CT', 'Parakeet', 'Qwen',
].join('\n');

const DEFAULTS: HubSettings = {
  limitsInStatusLine: true,
  soloSpaces: true,
  dictation: false,
  dictationCleanup: 'llm',
  dictationGlossary: DEFAULT_GLOSSARY,
  dictationTimeout: 10,
  dictationButton: 'hold',
  dictationShortcut: DEFAULT_DICTATION_SHORTCUT,
  keybar: DEFAULT_KEYBAR,
  keybarScale: KEYBAR_SCALE_DEFAULT,
  folders: {},
  hubAddresses: { tailnet: '', lan: '', internal: '' },
  hubUrls: [],
  commands: {},
  trelloExtension: {},
  trelloPromptTemplate: DEFAULT_TEMPLATE,
};

/** IP addresses (or ssh's from= patterns: CIDR, *), comma-separated; anything else is dropped. */
function sanitizeAddresses(raw: unknown): HubAddresses | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const one = (v: unknown) => {
    const s = typeof v === 'string' ? v.replace(/\s+/g, '') : '';
    return /^[0-9a-fA-F.:/*?,]{0,100}$/.test(s) ? s.replace(/^,+|,+$/g, '') : '';
  };
  return { tailnet: one(r.tailnet), lan: one(r.lan), internal: one(r.internal) };
}

/** http(s) URLs, without a trailing slash, each once (up to 10). */
function sanitizeUrls(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    const s = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '';
    if (!/^https?:\/\/[^\s'"`$\\]{1,200}$/.test(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out.slice(0, 10);
}
/**
 * Kept in the file, not in the settings: the default glossary went into an empty one
 * once. Emptied on purpose afterwards, it stays empty.
 */
const SEEDED = 'dictationGlossarySeeded';
/** Hosts whose `projects` block of the config went into their folders already (once). */
const MIGRATED = 'projectsMigrated';
/** Plenty for a list of terms, and it goes into every cleanup prompt. */
const GLOSSARY_MAX = 2000;

/** The folder lists of `patch` replace those of the same hosts; an empty one removes its host. */
function mergeFolders(current: HubSettings['folders'], patch: unknown): HubSettings['folders'] {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return current;
  const next = { ...current };
  for (const [host, value] of Object.entries(patch)) {
    const list = sanitizeFolderList(value);
    if (!list) continue;
    if (list.length) next[host] = list;
    else delete next[host];
  }
  return next;
}

/** The commands of `patch` replace those of the same hosts; claude (the default) removes its host. */
function mergeCommands(current: HubSettings['commands'], patch: unknown): HubSettings['commands'] {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return current;
  const next = { ...current };
  for (const [host, value] of Object.entries(patch)) {
    const command = sanitizeCommand(value);
    if (command === null) continue;
    if (command === DEFAULT_COMMAND) delete next[host];
    else next[host] = command;
  }
  return next;
}

/** The machines with the Trello extension, as kept: host id → an absolute folder. */
function sanitizeTrelloExtension(value: unknown): HubSettings['trelloExtension'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, dir]) => typeof dir === 'string' && dir.startsWith('/') && !/[\n\0]/.test(dir)));
}

/**
 * Settings of the whole hub, chosen in the web app and kept in dataDir so every
 * device sees the same ones.
 *
 * Events: 'change' (HubSettings).
 */
export class SettingsStore extends EventEmitter {
  private readonly path: string;
  private state: HubSettings = DEFAULTS;
  private migrated: string[] = [];

  constructor(dataDir: string) {
    super();
    this.path = join(dataDir, 'settings.json');
    try {
      if (!existsSync(this.path)) return;
      const { [SEEDED]: seeded, [MIGRATED]: migrated, ...saved } = JSON.parse(readFileSync(this.path, 'utf8'));
      if (Array.isArray(migrated)) this.migrated = migrated.map(String);
      this.state = {
        ...DEFAULTS,
        ...saved,
        keybar: sanitizeKeybar(saved.keybar) ?? DEFAULTS.keybar,
        keybarScale: sanitizeKeybarScale(saved.keybarScale) ?? DEFAULTS.keybarScale,
        folders: mergeFolders({}, saved.folders),
        commands: mergeCommands({}, saved.commands),
        trelloExtension: sanitizeTrelloExtension(saved.trelloExtension),
        hubAddresses: sanitizeAddresses(saved.hubAddresses) ?? DEFAULTS.hubAddresses,
        hubUrls: sanitizeUrls(saved.hubUrls) ?? DEFAULTS.hubUrls,
      };
      // Settings from before the default glossary: an empty one gets it, once.
      if (!seeded && !this.state.dictationGlossary.trim()) {
        this.state = { ...this.state, dictationGlossary: DEFAULT_GLOSSARY };
        this.save();
      }
    } catch {
      /* unreadable: defaults */
    }
  }

  private save(): void {
    try {
      writeFileSync(this.path, JSON.stringify({ ...this.state, [SEEDED]: true, [MIGRATED]: this.migrated }, null, 2));
    } catch (err) {
      console.warn(`[settings] no se pudo guardar ${this.path}: ${(err as Error).message}`);
    }
  }

  get value(): HubSettings {
    return this.state;
  }

  /** Only known keys with a value of the right type are kept. */
  update(patch: Partial<HubSettings>): void {
    const next = { ...this.state };
    if (typeof patch.limitsInStatusLine === 'boolean') next.limitsInStatusLine = patch.limitsInStatusLine;
    if (typeof patch.soloSpaces === 'boolean') next.soloSpaces = patch.soloSpaces;
    if (typeof patch.dictation === 'boolean') next.dictation = patch.dictation;
    if (patch.dictationCleanup === 'llm' || patch.dictationCleanup === 'none') next.dictationCleanup = patch.dictationCleanup;
    if (typeof patch.dictationGlossary === 'string') next.dictationGlossary = patch.dictationGlossary.slice(0, GLOSSARY_MAX);
    if ((DICTATION_TIMEOUTS as readonly number[]).includes(patch.dictationTimeout as number)) next.dictationTimeout = patch.dictationTimeout!;
    if (patch.dictationButton === 'hold' || patch.dictationButton === 'toggle') next.dictationButton = patch.dictationButton;
    if (typeof patch.dictationShortcut === 'string') {
      const sc = parseShortcut(patch.dictationShortcut);
      if (sc) next.dictationShortcut = serializeShortcut(sc);
    }
    const keybar = sanitizeKeybar(patch.keybar);
    if (keybar) next.keybar = keybar;
    const keybarScale = sanitizeKeybarScale(patch.keybarScale);
    if (keybarScale !== null) next.keybarScale = keybarScale;
    if (patch.folders !== undefined) next.folders = mergeFolders(next.folders, patch.folders);
    if (patch.commands !== undefined) next.commands = mergeCommands(next.commands, patch.commands);
    if (typeof patch.trelloPromptTemplate === 'string') next.trelloPromptTemplate = patch.trelloPromptTemplate.trim().slice(0, 2000) || DEFAULT_TEMPLATE;
    const addresses = sanitizeAddresses(patch.hubAddresses);
    if (addresses) next.hubAddresses = addresses;
    const urls = sanitizeUrls(patch.hubUrls);
    if (urls) next.hubUrls = urls;
    this.state = next;
    this.save();
    this.emit('change', next);
  }

  /** A machine left the hub: its folders, command and Trello extension go with it. */
  forgetHost(hostId: string): void {
    const drop = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([id]) => id !== hostId));
    this.state = { ...this.state, folders: drop(this.state.folders), commands: drop(this.state.commands), trelloExtension: drop(this.state.trelloExtension) };
    this.save();
    this.emit('change', this.state);
  }

  /**
   * A machine starts (its folder) or stops (null) keeping the Trello extension up to date.
   * Not in update(): only the hub sets it, once install.sh did it on the machine.
   */
  setTrelloExtension(hostId: string, dir: string | null): void {
    const next = { ...this.state.trelloExtension };
    if (dir) next[hostId] = dir;
    else delete next[hostId];
    this.state = { ...this.state, trelloExtension: next };
    this.save();
    this.emit('change', this.state);
  }

  /**
   * The `projects` block a host had in the config (before the folders moved into the
   * panel) becomes one of its folders, with its subfolders, and its command: once per
   * host, so removing that folder afterwards sticks. Returns the hosts migrated now.
   */
  migrateProjects(hosts: { id: string; projects: { dir: string; command: string } | null }[]): string[] {
    const done: string[] = [];
    let next = this.state;
    for (const h of hosts) {
      if (!h.projects || this.migrated.includes(h.id)) continue;
      const list = next.folders[h.id] ?? [];
      const path = h.projects.dir.trim().replace(/(.)\/+$/, '$1');
      let name = baseName(path);
      for (let i = 2; list.some((f) => f.name === name); i++) name = `${baseName(path)}-${i}`;
      const folders = list.some((f) => sameFolder(f, path, true)) ? list : [...list, { name, path, subfolders: true }];
      next = {
        ...next,
        folders: mergeFolders(next.folders, { [h.id]: folders }),
        commands: mergeCommands(next.commands, { [h.id]: h.projects.command }),
      };
      this.migrated = [...this.migrated, h.id];
      done.push(h.id);
    }
    if (!done.length) return done;
    this.state = next;
    this.save();
    return done;
  }
}
