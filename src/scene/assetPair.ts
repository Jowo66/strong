// The converted assets (characters, moves, props) are each a JSON manifest plus a binary it indexes into. If the two
// don't match (a copy of one cached from before a deploy, or a dev-server hiccup returning a short body) decoding
// throws; fetch both again past the HTTP cache once before giving up.

export async function loadAssetPair<M, T>(url: string, decode: (manifest: M, bin: ArrayBuffer) => T): Promise<T> {
  const get = (init?: RequestInit) => Promise.all([
    fetch(`${url}.json`, init).then((r) => { if (!r.ok) throw new Error(`${url}.json ${r.status}`); return r.json() as Promise<M>; }),
    fetch(`${url}.bin`, init).then((r) => { if (!r.ok) throw new Error(`${url}.bin ${r.status}`); return r.arrayBuffer(); }),
  ]);
  const [m, bin] = await get();
  try {
    return decode(m, bin);
  } catch {
    const [m2, bin2] = await get({ cache: 'reload' });
    return decode(m2, bin2);
  }
}
