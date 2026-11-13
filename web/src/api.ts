/**
 * A REST call to the hub: GET without a body, POST (JSON) with one. A failed call throws
 * an Error with the hub's Spanish `error` as its message and the whole answer as `data`
 * (Ajustes › Máquinas reads the kit report of a failed removal there).
 */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { data });
  return data as T;
}
