import { render } from 'preact';
import { boot } from './auth';
import { Root } from './components/App';
import { resumePresence } from './presence';
import { navigate } from './router';
import { bindShortcuts } from './shortcuts';
import './styles.css';

void boot();
bindShortcuts();
void resumePresence();
render(<Root />, document.getElementById('app')!);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker:', err));
  // A tapped notification while the app is already open: go to that pane.
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'navigate' && typeof ev.data.url === 'string') navigate(new URL(ev.data.url).hash || '#/');
  });
}
