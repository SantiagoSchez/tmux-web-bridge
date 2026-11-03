import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DICTATION_SHORTCUT, DICTATION_TIMEOUTS, parseShortcut, serializeShortcut } from '../../shared/dictation.js';
import { DEFAULT_KEYBAR, sanitizeKeybar } from '../../shared/keybar.js';
import type { HubSettings } from '../../shared/types.js';

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
};
/**
 * Kept in the file, not in the settings: the default glossary went into an empty one
 * once. Emptied on purpose afterwards, it stays empty.
 */
const SEEDED = 'dictationGlossarySeeded';
/** Plenty for a list of terms, and it goes into every cleanup prompt. */
const GLOSSARY_MAX = 2000;

/**
 * Settings of the whole hub, chosen in the web app and kept in dataDir so every
 * device sees the same ones.
 *
 * Events: 'change' (HubSettings).
 */
export class SettingsStore extends EventEmitter {
  private readonly path: string;
  private state: HubSettings = DEFAULTS;

  constructor(dataDir: string) {
    super();
    this.path = join(dataDir, 'settings.json');
    try {
      if (!existsSync(this.path)) return;
      const { [SEEDED]: seeded, ...saved } = JSON.parse(readFileSync(this.path, 'utf8'));
      this.state = { ...DEFAULTS, ...saved, keybar: sanitizeKeybar(saved.keybar) ?? DEFAULTS.keybar };
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
      writeFileSync(this.path, JSON.stringify({ ...this.state, [SEEDED]: true }, null, 2));
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
    this.state = next;
    this.save();
    this.emit('change', next);
  }
}
