import { useRef } from 'preact/hooks';
import { uploadFiles } from '../upload';

/** 📎: pick files (on a phone: gallery, camera or files) and send them to the pane for Claude. */
export function AttachButton({ hostId, paneId, class: cls }: { hostId: string; paneId: string; class: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" class={cls} aria-label="Adjuntar ficheros" title="Adjuntar ficheros para Claude" onClick={() => input.current?.click()}>
        📎
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = '';
          if (files.length) void uploadFiles(hostId, paneId, files);
        }}
      />
    </>
  );
}
