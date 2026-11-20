import { useEffect, useState } from 'preact/hooks';
import { sanitizeAccountRotation } from '../../../shared/rotation';
import type { AccountRotationSettings } from '../../../shared/types';
import { hubSettings, machinesInfo } from '../state';
import { hub } from '../ws';

// Ajustes › Máquinas › «Cambio automático de cuenta»: the two thresholds, the same for
// every machine, and one switch per machine. The hub decides (server/src/rotation.ts).

type Field = 'fiveHour' | 'sevenDay';

/** Saves a change, shown here at once, before the hub sends it back to every device. */
function save(patch: Partial<AccountRotationSettings>): void {
  // The hub's settings as they are now, not as a render saw them: two taps in a row build on each other.
  const current = hubSettings.value;
  if (!current) return;
  const accountRotation = sanitizeAccountRotation({ ...current.accountRotation, ...patch }, current.accountRotation);
  hubSettings.value = { ...current, accountRotation };
  hub.send({ t: 'settings', settings: { accountRotation } });
}

/** A threshold as typed, saved when the field loses focus; a value the hub would refuse is put back. */
function Threshold({ field, label }: { field: Field; label: string }) {
  const saved = hubSettings.value?.accountRotation[field];
  const [typed, setTyped] = useState(String(saved ?? ''));
  const [problem, setProblem] = useState(false);
  useEffect(() => setTyped(String(saved ?? '')), [saved]);
  const commit = () => {
    const n = Number(typed);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      setProblem(true);
      setTyped(String(saved ?? ''));
      return;
    }
    setProblem(false);
    if (n !== saved) save({ [field]: n });
  };
  return (
    <>
      <label>
        {label}
        <input class="text-input" type="number" min={1} max={100} step={1} inputMode="numeric" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} onBlur={commit} />%
      </label>
      {problem && (
        <p class="rotation-problem small" role="alert">
          Tiene que ser un número entero del 1 al 100.
        </p>
      )}
    </>
  );
}

export function AccountRotationSettings() {
  const s = hubSettings.value?.accountRotation;
  const machines = machinesInfo.value?.list ?? [];
  if (!s) return null;
  const toggle = (id: string, on: boolean) => {
    const hosts = hubSettings.value?.accountRotation.hosts ?? [];
    save({ hosts: on ? [...hosts, id] : hosts.filter((h) => h !== id) });
  };
  return (
    <section class="setting">
      <h3>Cambio automático de cuenta</h3>
      <p class="dim small">
        Cuando la cuenta de Claude de una máquina llega al umbral de su límite de 5 h o del semanal, el servidor central la pasa a otra cuenta con margen, igual que al cambiarla desde la franja de límites, sin reiniciar sus Claude Code. Solo puede pasarla a una cuenta de la que guarde una sesión libre. Si la vuelves a poner a mano en una cuenta por encima del umbral, la cambia otra vez: apaga aquí su interruptor para dejarla. Cada cambio sale en «Actividad» y en una notificación.
      </p>
      <div class="rotation-thresholds">
        <Threshold field="fiveHour" label="Límite de 5 h" />
        <Threshold field="sevenDay" label="Límite semanal" />
      </div>
      {machines.length > 0 && (
        <ul class="machine-list">
          {machines.map((m) => {
            const on = s.hosts.includes(m.id);
            return (
              <li key={m.id}>
                <span class="project-text">
                  <span class="project-name">{m.name}</span>
                </span>
                <button class={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={`Cambio automático de cuenta en ${m.name}`} onClick={() => toggle(m.id, !on)} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
