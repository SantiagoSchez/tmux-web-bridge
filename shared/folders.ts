import type { SavedFolder } from './types.js';

/** Folders added in the panel, per machine. */
export const MAX_FOLDERS = 100;
const MAX_PATH = 1000;

/** Why a project or folder name can't be used (as `c --new-project` takes it: no '/', no leading '.'), or null. */
export function folderNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Falta el nombre.';
  if (n.includes('/')) return 'El nombre no puede llevar «/».';
  if (n.startsWith('.')) return 'El nombre no puede empezar por punto.';
  if (n.length > 100) return 'El nombre es demasiado largo.';
  return null;
}

/** A folder path as the hub takes it: absolute, or under ~. */
export function folderPathOk(path: string): boolean {
  return path.length <= MAX_PATH && !path.includes('\n') && !path.includes('\0') && (path.startsWith('/') || path === '~' || path.startsWith('~/'));
}

/** The last part of a path: the name a folder gets by default. */
export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || path;
}

/** A folder inside another one. */
export function childPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, '')}/${name}`;
}

/** What is typed into a new space when a machine has no command set. */
export const DEFAULT_COMMAND = 'claude';
const MAX_COMMAND = 300;

/** A machine's command as the hub keeps it (one line), or null if it can't be one. */
export function sanitizeCommand(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_COMMAND || /[\n\r\0]/.test(value)) return null;
  return value.trim();
}

/** The same entry: a folder may be there twice, on its own and with its subfolders. */
export function sameFolder(f: SavedFolder, path: string, subfolders: boolean): boolean {
  return f.path === path && !!f.subfolders === subfolders;
}

/** One machine's list as the hub keeps it: valid entries, names trimmed, the first of each name and entry. */
export function sanitizeFolderList(value: unknown): SavedFolder[] | null {
  if (!Array.isArray(value)) return null;
  const out: SavedFolder[] = [];
  for (const f of value) {
    if (!f || typeof f !== 'object' || typeof f.name !== 'string' || typeof f.path !== 'string') continue;
    const name = f.name.trim();
    const path = f.path.trim().replace(/(.)\/+$/, '$1');
    const subfolders = f.subfolders === true;
    if (folderNameProblem(name) || !folderPathOk(path) || out.some((o) => o.name === name || sameFolder(o, path, subfolders))) continue;
    out.push(subfolders ? { name, path, subfolders } : { name, path });
    if (out.length === MAX_FOLDERS) break;
  }
  return out;
}
