// A file's type, told by its name: what the file viewer does with it (Files.tsx) and the
// icon the explorer and «Ficheros cambiados» give it. Its content is never looked at.

export type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'code' | 'archive' | 'file';

const EXTENSIONS: [FileType, string[]][] = [
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']],
  ['video', ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv']],
  ['audio', ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac']],
  ['pdf', ['pdf']],
  ['markdown', ['md', 'markdown', 'mdx']],
  [
    'code',
    [
      ...['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php'],
      ...['sh', 'bash', 'zsh', 'fish', 'ps1', 'lua', 'pl', 'r', 'scala', 'sql', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte'],
      ...['json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf'],
    ],
  ],
  // `.gz` covers `.tar.gz`.
  ['archive', ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar']],
];

const BY_EXTENSION = new Map(EXTENSIONS.flatMap(([type, exts]) => exts.map((e) => [e, type] as const)));

/** Files with no extension that are code by convention. */
const CODE_NAMES = new Set(['dockerfile', 'makefile']);

/** The type of `name` (a file's name or its path), by its extension, ignoring case; 'file' when none fits. */
export function fileType(name: string): FileType {
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
  if (CODE_NAMES.has(base)) return 'code';
  const dot = base.lastIndexOf('.');
  // A leading dot only (`.env`) is a hidden name, not an extension.
  if (dot <= 0) return 'file';
  return BY_EXTENSION.get(base.slice(dot + 1)) ?? 'file';
}
