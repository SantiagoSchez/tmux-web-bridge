import { hub } from '../ws';
import { updateNotice } from '../updates';
import { IconClose } from './icons';

/** A new release of twb: stays on top until closed, and then until the next one. */
export function UpdateBanner() {
  const n = updateNotice.value;
  if (!n) return null;
  return (
    <div class="update-banner" role="status">
      <span class="update-text">
        {n.hub ? `twb ${n.latest} disponible (el servidor central tiene la ${n.current}).` : `twb ${n.latest} disponible.`}
        {n.kits.length > 0 && ` Kit por actualizar en ${n.kits.join(', ')}: haz git pull en su clon.`}{' '}
        <a href={n.url} target="_blank" rel="noopener">
          Ver novedades
        </a>
      </span>
      <button class="toast-close" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={() => hub.send({ t: 'updateDismiss', version: n.latest })}>
        <IconClose />
      </button>
    </div>
  );
}
