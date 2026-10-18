import type { HostInfo, PaneInfo } from '../../../shared/types';
import { openWindow } from '../router';
import { multiHost, pending } from '../state';

/** The other panes waiting for you (🙋 💬 ✅), to jump between them without the list. */
export function PendingStrip({ host, pane }: { host: HostInfo; pane: PaneInfo }) {
  const others = pending.value.filter((p) => !(p.host.id === host.id && p.pane.id === pane.id));
  if (!others.length) return null;
  return (
    <div class="pending-strip scroll-x" role="navigation" aria-label="Otros pendientes">
      {others.map((p) => (
        <button
          key={`${p.host.id}:${p.pane.id}`}
          class={`pchip state-${p.pane.state}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => openWindow(p.host.id, p.window.id, p.pane.id, true)}
        >
          <span>{p.pane.icon}</span>
          <span class="pchip-name">{p.window.name}</span>
          {multiHost.value && <span class="pchip-host">{p.host.name}</span>}
        </button>
      ))}
    </div>
  );
}
