import { useEffect } from 'preact/hooks';
import { auth } from '../auth';
import { isDesktop } from '../prefs';
import { route } from '../router';
import { findWindow, hosts, wsStatus } from '../state';
import { ActivitySheet } from './Activity';
import { Connections } from './Connections';
import { FilePeek } from './FilePeek';
import { FileViewerSheet } from './Files';
import { Dialogs, Toasts } from './Dialogs';
import { Drawer } from './Drawer';
import { Grid } from './Grid';
import { Header } from './Header';
import { LimitsBar } from './LimitsBar';
import { Login } from './Login';
import { Palette } from './Palette';
import { Settings } from './Settings';
import { loadTrelloInfo, TrelloSheet } from './Trello';
import { Tree } from './Tree';
import { UpdateBanner } from './UpdateBanner';
import { WindowView } from './WindowView';

/** The app, or the password screen when the hub asks for one. */
export function Root() {
  const a = auth.value;
  if (!a) return null;
  if (!a.authenticated) return <Login />;
  return <App />;
}

export function App() {
  const r = route.value;
  const desktop = isDesktop.value;
  const target = r.name === 'window' ? findWindow(r.host, r.window) : null;
  useEffect(() => void loadTrelloInfo(), []);

  // Close the notification of a window (one per window) once it is on screen.
  useEffect(() => {
    if (r.name !== 'window' || !('serviceWorker' in navigator)) return;
    const tag = `${r.host}:${r.window}`;
    navigator.serviceWorker.getRegistration().then((reg) => reg?.getNotifications({ tag }).then((ns) => ns.forEach((n) => n.close())));
  }, [r.name === 'window' ? `${r.host}:${r.window}` : '']);

  const main =
    r.name === 'window' ? (
      target ? (
        <WindowView key={`${r.host}`} host={target.host} session={target.session} window={target.window} paneId={r.pane} />
      ) : (
        <Missing loading={wsStatus.value !== 'open' || hosts.value.find((h) => h.id === r.host)?.status !== 'ok'} />
      )
    ) : r.name === 'grid' ? (
      <Grid />
    ) : null;

  if (desktop) {
    return (
      <div class="layout desktop">
        <LimitsBar />
        <UpdateBanner />
        <aside class="sidebar">
          <Header />
          <Tree />
        </aside>
        <main class="main">{main ?? <Empty />}</main>
        <Overlays />
      </div>
    );
  }
  return (
    <div class="layout mobile">
      <LimitsBar />
      <UpdateBanner />
      {main ?? (
        <>
          <Header />
          <Tree />
        </>
      )}
      {r.name === 'window' && <Drawer />}
      <Overlays />
    </div>
  );
}

function Overlays() {
  return (
    <>
      <Connections />
      <Settings />
      <TrelloSheet />
      <ActivitySheet />
      <FileViewerSheet />
      <FilePeek />
      <Dialogs />
      <Palette />
      <Toasts />
    </>
  );
}

function Empty() {
  return (
    <div class="empty">
      <div class="empty-mark">›_</div>
      <p>Elige una ventana a la izquierda.</p>
      <p class="dim">Los pendientes (🙋 💬 ✅) aparecen arriba del todo.</p>
    </div>
  );
}

function Missing({ loading }: { loading: boolean }) {
  return (
    <div class="empty">
      {loading ? (
        <p class="dim">Cargando…</p>
      ) : (
        <>
          <p>Esa ventana ya no existe.</p>
          <a class="btn" href="#/">
            Volver a la lista
          </a>
        </>
      )}
    </div>
  );
}
