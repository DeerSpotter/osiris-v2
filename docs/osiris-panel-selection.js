(() => {
  const hasCore = () => (
    typeof model !== 'undefined' &&
    typeof renderPanel === 'function' &&
    typeof selectNode === 'function' &&
    typeof setZoom === 'function' &&
    typeof layerLabels !== 'undefined' &&
    typeof presets !== 'undefined' &&
    typeof countLayer === 'function' &&
    typeof escapeHtml === 'function' &&
    typeof updateLayerStatus === 'function'
  );

  const wait = () => {
    if (!hasCore()) return setTimeout(wait, 50);
    installPanelSelection();
  };

  function installPanelSelection() {
    if (installPanelSelection.done) return;
    installPanelSelection.done = true;

    function allNodesForLayer(key) {
      const layer = model.layers?.[key];
      return Array.isArray(layer?.nodes) ? layer.nodes : [];
    }

    function getPanelItems(keys, limit = 18) {
      const items = [];
      const search = String(model.searchText || '').trim().toLowerCase();
      for (const key of keys) {
        const layer = model.layers?.[key];
        for (const n of allNodesForLayer(key).filter((x) => x.label).slice(0, 120)) {
          const haystack = `${n.label} ${n.source} ${layerLabels[key] || key}`.toLowerCase();
          if (search && !haystack.includes(search)) continue;
          items.push({
            kind: 'node',
            title: n.label,
            meta: n.source || layerLabels[key] || key,
            value: n.url ? 'OPEN SOURCE' : '',
            layer: key,
            node: n
          });
        }
        for (const p of layer?.panel || []) {
          const haystack = `${p.title || ''} ${p.meta || ''} ${p.value || ''} ${layerLabels[key] || key}`.toLowerCase();
          if (search && !haystack.includes(search)) continue;
          items.push({ ...p, kind: 'panel', layer: key });
        }
      }
      return items.slice(0, limit);
    }

    function focusNode(node) {
      if (!node) return;
      model.view.targetLon = node.lon;
      model.view.targetLat = Math.max(-72, Math.min(78, node.lat));
      setZoom(Math.max(model.view.zoom, 4.2));
      selectNode(node);

      const deck = document.getElementById('panelDeck');
      if (deck) deck.classList.add('compact-selected');

      const eventTitle = document.getElementById('eventTitle');
      const eventMeta = document.getElementById('eventMeta');
      if (eventTitle) eventTitle.textContent = node.label || layerLabels[node.layer] || 'SELECTED ITEM';
      if (eventMeta) eventMeta.textContent = `${layerLabels[node.layer] || node.layer} · ${node.source || 'repo cache'} · ${node.lat.toFixed(4)}, ${node.lon.toFixed(4)}`;
    }

    function selectableCard(item, index) {
      const title = escapeHtml(item.title || layerLabels[item.layer] || 'Item');
      const meta = escapeHtml(item.meta || layerLabels[item.layer] || '');
      const value = item.value ? `<em>${escapeHtml(String(item.value))}</em>` : '';
      if (item.kind === 'node' && item.node) {
        return `<button type="button" class="feed-card feed-card-button" data-select-panel-node="${index}"><b>${title}</b><span>${meta}</span>${value}</button>`;
      }
      if (item.url) {
        return `<a class="feed-card" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><b>${title}</b><span>${meta}</span>${value}</a>`;
      }
      return `<div class="feed-card"><b>${title}</b><span>${meta}</span>${value}</div>`;
    }

    let currentItems = [];
    const originalRenderPanel = renderPanel;
    renderPanel = function selectableRenderPanel(name = 'recon') {
      const deck = document.getElementById('panelDeck');
      if (!deck || !['markets', 'intel', 'search', 'recon'].includes(name)) {
        currentItems = [];
        return originalRenderPanel(name);
      }

      model.activePanel = name;
      deck.className = `panel-deck open ${name}`;
      const title = (typeof presetTitles !== 'undefined' && presetTitles[name]) || 'OSIRIS PANEL';
      const keys = presets[name] || presets.recon;
      currentItems = getPanelItems(keys, name === 'search' ? 24 : 12);

      const stats = keys.map((key) => {
        const c = countLayer(key);
        return `<button type="button" class="stat-chip ${model.activeLayers[key] ? 'active' : ''}" data-toggle-layer="${key}"><span>${layerLabels[key]}</span><strong>${c.nodes + c.routes}</strong></button>`;
      }).join('');

      const cards = currentItems.length
        ? currentItems.map(selectableCard).join('')
        : `<div class="empty-panel">Layer data will appear after the Pages cache refresh workflow runs.</div>`;

      const searchBox = name === 'search'
        ? `<label class="panel-search"><span>SEARCH CACHE</span><input id="panelSearchInput" value="${escapeHtml(model.searchText)}" placeholder="camera, port, quake, country..."></label>`
        : '';

      deck.innerHTML = `<div class="panel-head"><div><small>${name.toUpperCase()}</small><h2>${title}</h2></div><button type="button" data-close-panel aria-label="Close panel">×</button></div>${searchBox}<div class="stat-grid">${stats}</div><div class="feed-list">${cards}</div>`;

      const input = document.getElementById('panelSearchInput');
      if (input) input.addEventListener('input', (e) => {
        model.searchText = e.target.value || '';
        updateLayerStatus();
      });
    };

    document.body.addEventListener('click', (event) => {
      const card = event.target.closest('[data-select-panel-node]');
      if (!card) return;
      event.preventDefault();
      const item = currentItems[Number(card.getAttribute('data-select-panel-node'))];
      if (item?.node) focusNode(item.node);
    });

    const style = document.createElement('style');
    style.textContent = `.feed-card-button{width:100%;font:inherit;text-align:left;cursor:pointer}.feed-card-button:active{transform:scale(.985);border-color:rgba(245,217,107,.7);background:rgba(212,175,55,.14)}.panel-deck.compact-selected{max-height:32vh}.panel-deck.compact-selected .stat-grid{display:none}.panel-deck.compact-selected .feed-list{max-height:17vh;overflow:auto}`;
    document.head.appendChild(style);

    renderPanel(model.activePanel || 'search');
  }

  wait();
})();
