export interface Env {
  HUBEAU_BASE?: string;
  HUBEAU_PATH_COMMUNES?: string;
  HUBEAU_PATH_RESULTATS?: string;
  APW_CACHE_TTL_MS?: string;
  APW_SIZE?: string;
  APW_ALLOW_ORIGIN?: string;
}

const DEFAULT_TTL_MS = 86400000;
const DEFAULT_SIZE = 25;

const cache = caches.default;

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return res.json();
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const corsOrigin = env.APW_ALLOW_ORIGIN || '*';

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const respond = (body: any, status = 200) => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': corsOrigin
      });
      return new Response(JSON.stringify(body), { status, headers });
    };

    const ttlMs = Number(env.APW_CACHE_TTL_MS || DEFAULT_TTL_MS);
    const size = String(env.APW_SIZE || DEFAULT_SIZE);
    const base = env.HUBEAU_BASE || 'https://hubeau.eaufrance.fr';
    const pathCommunes = env.HUBEAU_PATH_COMMUNES || '/api/v1/communes';
    const pathResultats = env.HUBEAU_PATH_RESULTATS || '/api/v1/qualite/eau_potable/resultats';

    try {
      if (action === 'ping') {
        return respond({ ok: true, ts: Date.now() });
      }

      if (action === 'communes') {
        const postal = url.searchParams.get('postal') || '';
        if (!postal) return respond({ error: 'postal manquant' }, 400);
        const cacheKey = new Request(request.url, { cf: { cacheEverything: true } });
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        const apiUrl = `${base}${pathCommunes}?code_postal=${encodeURIComponent(postal)}`;
        const raw = await fetchJson(apiUrl);
        const result = (raw?.data || raw || []).map((r: any) => ({
          nom: r.nom || r.libelle_commune || r.commune || 'Commune',
          code_insee: r.code_insee || r.insee || r.code_commune || '',
          code_postal: r.code_postal || postal
        }));
        const response = respond(result);
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }

      if (action === 'resultats') {
        const insee = url.searchParams.get('insee') || '';
        const paramIds = url.searchParams.getAll('param_id');
        if (!insee) return respond({ error: 'insee manquant' }, 400);
        const cacheKey = new Request(request.url, { cf: { cacheEverything: true } });
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        const qs = new URLSearchParams();
        qs.set('code_commune', insee);
        paramIds.forEach(p => qs.append('code_parametre', p));
        qs.set('size', size);
        qs.set('order', 'desc');
        const apiUrl = `${base}${pathResultats}?${qs.toString()}`;
        const raw = await fetchJson(apiUrl);
        const rows = (raw?.data || raw || []).map((r: any) => ({
          parametre_id: r.code_parametre ?? r.parametre ?? r.id_parametre ?? null,
          parametre_libelle: r.libelle_parametre ?? r.parametre_libelle ?? null,
          valeur: r.resultat ?? r.valeur ?? r.value ?? null,
          unite: r.unite ?? r.unite_resultat ?? r.unit ?? null,
          date_prelevement: r.date_prelevement ?? r.prelevement_date ?? r.date ?? null,
          source: "Hub'Eau"
        }));
        const response = respond(rows);
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }

      return respond({ error: 'action invalide' }, 400);
    } catch (err: any) {
      return respond({ error: 'server_error', detail: err?.message || 'unknown' }, 500);
    }
  }
};
