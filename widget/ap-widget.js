(() => {
  const container = document.getElementById('ap-water-widget');
  if (!container) return;

  const cfg = window.APW_CONFIG || {};
  const endpoint = cfg.endpoint || '';
  const defaultParamIds = Array.isArray(cfg.defaultParamIds) ? cfg.defaultParamIds : [];
  const cacheTtlSec = cfg.cacheTtlSec || 0;

  // create UI elements
  const wrapper = document.createElement('div');
  wrapper.className = 'apw-root';
  const postalInput = document.createElement('input');
  postalInput.type = 'text';
  postalInput.placeholder = 'Code postal';
  postalInput.className = 'apw-input';
  const communeSelect = document.createElement('select');
  communeSelect.className = 'apw-select';
  const fetchBtn = document.createElement('button');
  fetchBtn.textContent = 'Obtenir les résultats';
  fetchBtn.className = 'apw-button';
  fetchBtn.disabled = true;
  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'apw-results';

  wrapper.appendChild(postalInput);
  wrapper.appendChild(communeSelect);
  wrapper.appendChild(fetchBtn);
  wrapper.appendChild(resultsDiv);
  container.appendChild(wrapper);

  let communes = [];
  let insee = '';

  postalInput.addEventListener('input', async () => {
    const val = postalInput.value.trim();
    resultsDiv.innerHTML = '';
    communeSelect.innerHTML = '';
    fetchBtn.disabled = true;
    if (val.length < 2) return;
    try {
      const url = `${endpoint}?action=communes&postal=${encodeURIComponent(val)}`;
      const resp = await fetch(url);
      communes = await resp.json();
      communes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code_insee;
        opt.textContent = `${c.nom} (${c.code_postal})`;
        communeSelect.appendChild(opt);
      });
      fetchBtn.disabled = communes.length === 0;
    } catch (err) {
      console.error(err);
    }
  });

  communeSelect.addEventListener('change', () => {
    insee = communeSelect.value;
    fetchBtn.disabled = !insee;
  });

  fetchBtn.addEventListener('click', async () => {
    insee = communeSelect.value;
    if (!insee) return;
    const paramsQuery = defaultParamIds.map(p => `param_id=${encodeURIComponent(p)}`).join('&');
    const url = `${endpoint}?action=resultats&insee=${encodeURIComponent(insee)}${paramsQuery ? '&' + paramsQuery : ''}`;
    resultsDiv.textContent = 'Chargement...';
    try {
      const resp = await fetch(url);
      const rows = await resp.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        resultsDiv.textContent = 'Aucun résultat';
        return;
      }
      let html = '<table class="apw-table"><thead><tr><th>Paramètre</th><th>Valeur</th><th>Unité</th><th>Date</th><th>Source</th></tr></thead><tbody>';
      rows.forEach(r => {
        html += `<tr><td>${r.parametre_libelle || r.parametre_id || ''}</td><td>${r.valeur ?? ''}</td><td>${r.unite ?? ''}</td><td>${r.date_prelevement ?? ''}</td><td>${r.source ?? ''}</td></tr>`;
      });
      html += '</tbody></table>';
      resultsDiv.innerHTML = html;
    } catch (err) {
      console.error(err);
      resultsDiv.textContent = 'Erreur lors de la récupération des résultats';
    }
  });
})();
