import { updateKits } from '../menus';
import { kitUpdating, updateNotice } from '../updates';
import { hub } from '../ws';
import { IconClose } from './icons';

/** A new release of twb: stays on top until closed, and then until the next one. */
export function UpdateBanner() {
  const n = updateNotice.value;
  if (!n) return null;
  return (
    <div class="update-banner" role="status">
      <span class="update-text">
        {n.hub ? `twb ${n.latest} disponible (el servidor central tiene la ${n.current}).` : `twb ${n.latest} disponible.`}
        {n.kits.length > 0 && ` Kit por actualizar en ${n.kits.map((h) => h.name).join(', ')}.`}{' '}
        <a href={n.url} target="_blank" rel="noopener">
          Ver novedades
        </a>
      </span>
      {n.kits.length > 0 && (
        <button class="btn btn-primary" disabled={kitUpdating.value} onClick={() => updateKits(n.kits, n.latest)}>
          {kitUpdating.value ? 'Actualizando…' : 'Actualizar'}
        </button>
      )}
      <button class="toast-close" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={() => hub.send({ t: 'updateDismiss', version: n.latest })}>
        <IconClose />
      </button>
    </div>
  );
}
