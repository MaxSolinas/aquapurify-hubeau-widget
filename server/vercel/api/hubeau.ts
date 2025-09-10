import type { VercelRequest, VercelResponse } from '@vercel/node';

// —— Config —— //
const HUBEAU_BASE = process.env.HUBEAU_BASE || 'https://hubeau.eaufrance.fr';
const PATH_COMMUNES = process.env.HUBEAU_PATH_COMMUNES || '/api/v1/communes';
const PATH_RESULTATS = process.env.HUBEAU_PATH_RESULTATS || '/api/v1/qualite/eau_potable/resultats';

const TTL_MS = Number(process.env.APW_CACHE_TTL_MS || 24*60*60*1000);
const SIZE = String(process.env.APW_SIZE || 25);

// —— CORS —— //
const ALLOW_ORIGIN = process.env.APW_ALLOW_ORIGIN || '*';

// —— Rate-limit ultra simple (IP) —— //
const hits = new Map<string, {t:number,c:number}>();
const WINDOW_MS = Number(process.env.APW_RL_WINDOW_MS || 60_000);   // 1 min
const MAX_HITS  = Number(process.env.APW_RL_MAX || 60);             // 60 req/min

function allow(ip: string) {
  const now = Date.now();
  const rec = hits.get(ip) || { t: now, c: 0 };
  if (now - rec.t > WINDOW_MS) { rec.t = now; rec.c = 0; }
  rec.c++;
  hits.set(ip, rec);
  return rec.c <= MAX_HITS;
}

// —— Cache mémoire éphémère —— //
const memory = new Map<string, { t: number; data: any }>();
const getCache = (k:string) => {
  const v = memory.get(k);
  if (!v) return null;
  if (Date.now() - v.t > TTL_MS) { memory.delete(k); return null; }
  return v.data;
};
const setCache = (k:string, data:any) => memory.set(k, { t: Date.now(), data });

async function httpJson(url: string) {
  const r = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Rate-limit
  const ip = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
  if (!allow(ip)) return res.status(429).json({ error: 'rate_limited', window_ms: WINDOW_MS, max: MAX_HITS });

  try {
    const { action } = (req.query || {}) as { action?: string };
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(TTL_MS/1000)}`);

    // Ping/health
    if (action === 'ping') {
      return res.status(200).json({ ok: true, ts: Date.now(), ip, rl: { window_ms: WINDOW_MS, max: MAX_HITS } });
    }

    // Communes par code postal (fallback local + API)
    if (action === 'communes') {
      const postal = String((req.query as any).postal || '').trim();
      if (!postal) return res.status(400).json({ error: 'postal manquant' });

      const key = `communes:${postal}`;
      const cached = getCache(key);
      if (cached) return res.status(200).json(cached);

      // 1) Fichier local (si présent)
      try {
        // @ts-ignore – import dynamique supporté en serverless
        const local = await import('../../../data/communes.sample.json');
        const arr = (local.default || []).filter((c: any) => String(c.code_postal).startsWith(postal));
        if (arr.length) { setCache(key, arr); return res.status(200).json(arr); }
      } catch {}

      // 2) API publique
      const url = `${HUBEAU_BASE}${PATH_COMMUNES}?code_postal=${encodeURIComponent(postal)}`;
      const raw = await httpJson(url);
      const out = (raw?.data || raw || []).map((r: any) => ({
        nom: r.nom || r.libelle_commune || r.commune || 'Commune',
        code_insee: r.code_insee || r.insee || r.code_commune || '',
        code_postal: r.code_postal || postal
      }));
      setCache(key, out);
      return res.status(200).json(out);
    }

    // Résultats analytiques par commune INSEE + codes paramètres
    if (action === 'resultats') {
      const insee = String((req.query as any).insee || '').trim();
      const paramIds = ([] as string[]).concat((req.query as any).param_id || []);
      if (!insee) return res.status(400).json({ error: 'insee manquant' });

      const key = `resultats:${insee}:${paramIds.sort().join(',')}`;
      const cached = getCache(key);
      if (cached) return res.status(200).json(cached);

      const qs = new URLSearchParams();
      qs.set('code_commune', insee);
      if (paramIds.length) paramIds.forEach(p => qs.append('code_parametre', p));
      qs.set('size', SIZE);
      qs.set('order', 'desc');

      const url = `${HUBEAU_BASE}${PATH_RESULTATS}?${qs.toString()}`;
      const raw = await httpJson(url);

      // Normalisation stricte
      const rows = (raw?.data || raw || []).map((r: any) => ({
        parametre_id: r.code_parametre ?? r.parametre ?? r.id_parametre ?? null,
        parametre_libelle: r.libelle_parametre ?? r.parametre_libelle ?? null,
        valeur: r.resultat ?? r.valeur ?? r.value ?? null,
        unite: r.unite ?? r.unite_resultat ?? r.unit ?? null,
        date_prelevement: r.date_prelevement ?? r.prelevement_date ?? r.date ?? null,
        source: "Hub'Eau"
      }));
      setCache(key, rows);
      return res.status(200).json(rows);
    }

    return res.status(400).json({ error: 'action invalide' });
  } catch (err: any) {
    console.error('[hubeau]', err?.stack || err?.message || err);
    return res.status(500).json({ error: 'server_error', detail: err?.message || 'unknown' });
  }
}
