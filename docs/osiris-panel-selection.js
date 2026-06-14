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

    const deck = document.getElementById('panelDeck');
    let currentItems = [];

    function allNodesForLayer(key) {
      const layer = model.layers?.[key];
      return Array.isArray(layer?.nodes) ? layer.nodes : [];
    }

    function cleanUrl(value) {
      const raw = String(value || '').trim();
      if (!raw || raw === '#') return '';
      try { return new URL(raw, location.href).href; } catch { return raw; }
    }

    function addQuery(url, params) {
      try {
        const u = new URL(url);
        for (const [key, value] of Object.entries(params)) if (!u.searchParams.has(key)) u.searchParams.set(key, value);
        return u.href;
      } catch { return url; }
    }

    function youtubeId(url) {
      try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || '';
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        const match = u.pathname.match(/\/(embed|shorts|live)\/([^/?#]+)/i);
        return match ? match[2] : '';
      } catch { return ''; }
    }

    function embedUrl(url) {
      const cleaned = cleanUrl(url);
      if (!cleaned) return '';
      const id = youtubeId(cleaned);
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
      if (/youtube(?:-nocookie)?\.com\/embed\//i.test(cleaned)) return addQuery(cleaned, { autoplay: '1', mute: '1', playsinline: '1' });
      return cleaned;
    }

    function mediaUrl(node) {
      return cleanUrl(node?.embedUrl || node?.embed_url || node?.streamUrl || node?.stream_url || node?.videoUrl || node?.video_url || node?.watchUrl || node?.watch_url || node?.url || node?.link || '');
    }

    function isVideoNode(node) {
      const layer = String(node?.layer || '').toLowerCase();
      const source = String(node?.source || '').toLowerCase();
      return layer === 'cctv' || layer === 'live_news' || source.includes('cctv') || source.includes('live news') || source.includes('camera');
    }

    function mediaMarkup(node) {
      if (!isVideoNode(node)) return '';
      const direct = mediaUrl(node);
      if (!direct) return `<div class="node-video node-video-empty"><strong>NO VIDEO URL IN CACHE</strong><span>Run the Pages data cache refresh so camera stream URLs are copied from the source data.</span></div>`;
      const src = embedUrl(direct);
      const native = /\.(m3u8|mp4|webm)(\?|#|$)/i.test(src);
      const player = native
        ? `<video src="${escapeHtml(src)}" controls playsinline muted autoplay></video>`
        : `<iframe src="${escapeHtml(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      return `<div class="node-video"><div class="node-video-head"><span>LIVE VIDEO</span><a href="${escapeHtml(direct)}" target="_blank" rel="noreferrer">OPEN DIRECT</a></div>${player}<p>If the embedded player is blocked, use <b>OPEN DIRECT</b>.</p></div>`;
    }

    function detailRows(node) {
      const rows = [
        ['Layer', layerLabels[node.layer] || node.layer || 'Unknown'],
        ['Source', node.source || 'Repo cache'],
        ['Coordinates', `${Number(node.lat).toFixed(5)}, ${Number(node.lon).toFixed(5)}`]
      ];
      if (node.url) rows.push(['URL', 'Available']);
      return rows.map(([k, v]) => `<div class="node-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
    }

    function showNodeDetail(node) {
      if (!node || !deck) return;
      model.selected = node;
      model.activePanel = 'node';
      deck.className = 'panel-deck open node-detail';
      const title = escapeHtml(node.label || layerLabels[node.layer] || 'Selected item');
      const layer = escapeHtml(layerLabels[node.layer] || node.layer || 'Node');
      deck.innerHTML = `<div class="panel-head node-head"><div><small>SELECTED ITEM</small><h2>${title}</h2></div><button type="button" data-close-node aria-label="Close selected item">×</button></div><div class="node-badge"><span></span>${layer}</div>${mediaMarkup(node)}<div class="node-detail-grid">${detailRows(node)}</div>`;
      const eventTitle = document.getElementById('eventTitle');
      const eventMeta = document.getElementById('eventMeta');
      if (eventTitle) eventTitle.textContent = node.label || layerLabels[node.layer] || 'SELECTED ITEM';
      if (eventMeta) eventMeta.textContent = `${layerLabels[node.layer] || node.layer} · ${node.source || 'repo cache'} · ${Number(node.lat).toFixed(4)}, ${Number(node.lon).toFixed(4)}`;
    }

    function getPanelItems(keys, limit = 18) {
      const items = [];
      const search = String(model.searchText || '').trim().toLowerCase();
      for (const key of keys) {
        const layer = model.layers?.[key];
        for (const n of allNodesForLayer(key).filter((x) => x.label).slice(0, 120)) {
          const haystack = `${n.label} ${n.source} ${layerLabels[key] || key}`.toLowerCase();
          if (search && !haystack.includes(search)) continue;
          items.push({ kind: 'node', title: n.label, meta: n.source || layerLabels[key] || key, value: n.url ? 'OPEN SOURCE' : '', layer: key, node: n });
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
      showNodeDetail(node);
    }

    function selectableCard(item, index) {
      const title = escapeHtml(item.title || layerLabels[item.layer] || 'Item');
      const meta = escapeHtml(item.meta || layerLabels[item.layer] || '');
      const value = item.value ? `<em>${escapeHtml(String(item.value))}</em>` : '';
      if (item.kind === 'node' && item.node) return `<button type="button" class="feed-card feed-card-button" data-select-panel-node="${index}"><b>${title}</b><span>${meta}</span>${value}</button>`;
      if (item.url) return `<a class="feed-card" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><b>${title}</b><span>${meta}</span>${value}</a>`;
      return `<div class="feed-card"><b>${title}</b><span>${meta}</span>${value}</div>`;
    }

    const originalRenderPanel = renderPanel;
    renderPanel = function selectableRenderPanel(name = 'recon') {
      if (name === 'node' && model.selected) return showNodeDetail(model.selected);
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
      const cards = currentItems.length ? currentItems.map(selectableCard).join('') : `<div class="empty-panel">Layer data will appear after the Pages cache refresh workflow runs.</div>`;
      const searchBox = name === 'search' ? `<label class="panel-search"><span>SEARCH CACHE</span><input id="panelSearchInput" value="${escapeHtml(model.searchText)}" placeholder="camera, port, quake, country..."></label>` : '';
      deck.innerHTML = `<div class="panel-head"><div><small>${name.toUpperCase()}</small><h2>${title}</h2></div><button type="button" data-close-panel aria-label="Close panel">×</button></div>${searchBox}<div class="stat-grid">${stats}</div><div class="feed-list">${cards}</div>`;
      const input = document.getElementById('panelSearchInput');
      if (input) input.addEventListener('input', (e) => { model.searchText = e.target.value || ''; updateLayerStatus(); });
    };

    selectNode = function nodeOnlySelect(node) { if (node) showNodeDetail(node); };

    document.body.addEventListener('click', (event) => {
      const card = event.target.closest('[data-select-panel-node]');
      if (card) {
        event.preventDefault();
        const item = currentItems[Number(card.getAttribute('data-select-panel-node'))];
        if (item?.node) focusNode(item.node);
        return;
      }
      if (event.target.closest('[data-close-node]')) {
        event.preventDefault();
        model.selected = null;
        model.activePanel = '';
        deck?.classList.remove('open', 'node-detail', 'compact-selected');
      }
    });

    document.querySelectorAll('.bottom-nav button').forEach((button) => {
      button.addEventListener('click', () => deck?.classList.remove('compact-selected', 'node-detail'), { capture: true });
    });

    const style = document.createElement('style');
    style.textContent = `.feed-card-button{width:100%;font:inherit;text-align:left;cursor:pointer}.feed-card-button:active{transform:scale(.985);border-color:rgba(245,217,107,.7);background:rgba(212,175,55,.14)}.panel-deck.compact-selected:not(.node-detail){max-height:32vh}.panel-deck.compact-selected:not(.node-detail) .stat-grid{display:none}.panel-deck.compact-selected:not(.node-detail) .feed-list{max-height:17vh;overflow:auto}.panel-deck.node-detail,.panel-deck.node-detail.compact-selected{max-height:min(70vh,calc(100dvh - 110px));overflow:auto}.node-head h2{max-width:68vw;line-height:1.15}.node-badge{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;padding:7px 10px;border:1px solid rgba(245,217,107,.35);border-radius:999px;color:#f5d96b;background:rgba(212,175,55,.1);font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase}.node-badge span{width:8px;height:8px;border-radius:999px;background:currentColor;box-shadow:0 0 12px currentColor}.node-video{margin:8px 0 12px;border:1px solid rgba(245,217,107,.28);border-radius:14px;background:rgba(0,0,0,.45);overflow:hidden}.node-video-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);color:#f5d96b;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}.node-video-head a{color:#00dff7;text-decoration:none;font-size:9px}.node-video iframe,.node-video video{display:block;width:100%;aspect-ratio:16/9;border:0;background:#000}.node-video p{margin:0;padding:8px 10px;color:rgba(230,238,242,.62);font:500 10px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.4}.node-video-empty{padding:13px;color:rgba(230,238,242,.7);font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace}.node-video-empty strong{display:block;color:#f5d96b;margin-bottom:5px;letter-spacing:.1em}.node-detail-grid{display:grid;gap:7px;margin-top:8px}.node-row{display:flex;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 9px;background:rgba(255,255,255,.035);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.node-row span{color:rgba(230,238,242,.46);font-size:9px;text-transform:uppercase;letter-spacing:.12em}.node-row strong{color:rgba(255,255,255,.86);font-size:10px;text-align:right;word-break:break-word}`;
    document.head.appendChild(style);

    setTimeout(() => {
      if (model.activePanel === 'recon' || model.activePanel === 'search') {
        model.activePanel = '';
        model.searchText = '';
        deck?.classList.remove('open', 'compact-selected', 'node-detail');
      }
    }, 150);
  }

  wait();
})();
