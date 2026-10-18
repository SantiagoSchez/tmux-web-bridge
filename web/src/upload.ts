import { toast } from './state';

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Sends files for Claude to the pane's machine (/tmp/twb-uploads). The hub types
 * each path into the pane, without Enter: you write the message around it.
 */
export async function uploadFiles(hostId: string, paneId: string, files: File[]): Promise<void> {
  for (const file of files) {
    const name = file.name || 'imagen.png';
    if (file.size > MAX_BYTES) {
      toast(`${name}: pasa de 25 MB`, 'error');
      continue;
    }
    try {
      const res = await fetch(`/api/upload?${new URLSearchParams({ host: hostId, pane: paneId, name })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? data.message ?? `Error ${res.status}`);
      toast(`Subido: ${name}`);
    } catch (err) {
      toast(`${name}: ${(err as Error).message}`, 'error');
    }
  }
}
