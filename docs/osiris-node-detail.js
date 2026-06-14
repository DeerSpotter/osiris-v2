(() => {
  const hasCore = () => (
    typeof model !== 'undefined' &&
    typeof renderPanel === 'function' &&
    typeof selectNode === 'function' &&
    typeof setZoom === 'function' &&
    typeof escapeHtml === 'function' &&
    typeof layerLabels !== 'undefined'
  );

  const wait = () => {
    if (!hasCore()) return setTimeout(wait, 50);
    installNodeDetails();
  };

  function installNodeDetails() {
    if (installNodeDetails.done) return;
    installNodeDetails.done = true;

    const deck = document.getElementById('panelDeck');
    if (!deck) return;

    const originalRenderPanel = renderPanel;

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
        const embed = u.pathname.match(/\/(embed|shorts|live)\/([^/?#]+)/i);
        if (embed) return embed[2];
      } catch {}
      return '';
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
      return cleanUrl(
        node?.embedUrl || node?.embed_url || node?.streamUrl || node?.stream_url ||
        node?.videoUrl || node?.video_url || node?.watchUrl || node?.watch_url ||
        node?.url || node?.link || ''
      );
    }

    function isVideoNode(node) {
      const layer = String(node?.layer || '').toLowerCase();
      const source = String(node?.source || '').toLowerCase();
      return layer === 'cctv' || layer === 'live_news' || source.includes('cctv') || source.includes('live news') || source.includes('camera');
    }

    function mediaMarkup(node) {
      if (!isVideoNode(node)) return '';
      const direct = mediaUrl(node);
      if (!direct) {
        return `<div class="node-video node-video-empty"><strong>NO VIDEO URL IN CACHE</strong><span>Run the Pages data cache refresh after this deploy so CCTV stream URLs are copied from OSIRIS.</span></div>`;
      }
      const src = embedUrl(direct);
      const isNative = /\.(m3u8|mp4|webm)(\?|#|$)/i.test(src);
      const player = isNative
        ? `<video src="${escapeHtml(src)}" controls playsinline muted autoplay></video>`
        : `<iframe src="${escapeHtml(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      return `<div class="node-video"><div class="node-video-head"><span>LIVE CCTV / VIDEO</span><a href="${escapeHtml(direct)}" target="_blank" rel="noreferrer">OPEN DIRECT</a></div>${player}<p>If the embedded player is blocked, use <b>OPEN DIRECT</b>.</p></div>`;
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
      if (!node) return;
      model.selected = node;
      model.activePanel = 'node';
      deck.className = 'panel-deck open node-detail';
      const title = escapeHtml(node.label || layerLabels[node.layer] || 'Selected node');
      const layer = escapeHtml(layerLabels[node.layer] || node.layer || 'Node');
      const tone = typeof window.tone === 'function' ? window.tone(node.tone || 'green', 1) : '#00f08a';
      deck.innerHTML = `
        <div class="panel-head node-head">
          <div><small>SELECTED NODE</small><h2>${title}</h2></div>
          <button type="button" data-close-node aria-label="Close selected node">×</button>
        </div>
        <div class="node-badge" style="--node-tone:${escapeHtml(tone)}"><span></span>${layer}</div>
        ${mediaMarkup(node)}
        <div class="node-detail-grid">${detailRows(node)}</div>
      `;
      if (eventTitle) eventTitle.textContent = node.label || layerLabels[node.layer] || 'SELECTED NODE';
      if (eventMeta) eventMeta.textContent = `${layerLabels[node.layer] || node.layer} · ${node.source || 'repo cache'} · ${Number(node.lat).toFixed(4)}, ${Number(node.lon).toFixed(4)}`;
    }

    renderPanel = function nodeAwareRenderPanel(name = 'recon') {
      if (name === 'node' && model.selected) {
        showNodeDetail(model.selected);
        return;
      }
      return originalRenderPanel(name);
    };

    selectNode = function nodeOnlySelect(node) {
      if (!node) return;
      showNodeDetail(node);
    };

    document.body.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-node]')) {
        event.preventDefault();
        model.selected = null;
        model.activePanel = '';
        deck.classList.remove('open', 'node-detail', 'compact-selected');
      }
    });

    document.querySelectorAll('.bottom-nav button').forEach((button) => {
      button.addEventListener('click', () => deck.classList.remove('compact-selected', 'node-detail'), { capture: true });
    });

    const style = document.createElement('style');
    style.textContent = `
      .panel-deck.node-detail,.panel-deck.node-detail.compact-selected{max-height:min(70vh, calc(100dvh - 110px));overflow:auto}
      .node-head h2{max-width:68vw;line-height:1.15}
      .node-badge{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;padding:7px 10px;border:1px solid color-mix(in srgb,var(--node-tone),transparent 50%);border-radius:999px;color:var(--node-tone);background:color-mix(in srgb,var(--node-tone),transparent 90%);font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase}
      .node-badge span{width:8px;height:8px;border-radius:999px;background:currentColor;box-shadow:0 0 12px currentColor}
      .node-video{margin:8px 0 12px;border:1px solid rgba(245,217,107,.28);border-radius:14px;background:rgba(0,0,0,.45);overflow:hidden}
      .node-video-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);color:#f5d96b;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
      .node-video-head a{color:#00dff7;text-decoration:none;font-size:9px}
      .node-video iframe,.node-video video{display:block;width:100%;aspect-ratio:16/9;border:0;background:#000}
      .node-video p{margin:0;padding:8px 10px;color:rgba(230,238,242,.62);font:500 10px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.4}
      .node-video-empty{padding:13px;color:rgba(230,238,242,.7);font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace}
      .node-video-empty strong{display:block;color:#f5d96b;margin-bottom:5px;letter-spacing:.1em}
      .node-detail-grid{display:grid;gap:7px;margin-top:8px}
      .node-row{display:flex;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 9px;background:rgba(255,255,255,.035);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .node-row span{color:rgba(230,238,242,.46);font-size:9px;text-transform:uppercase;letter-spacing:.12em}
      .node-row strong{color:rgba(255,255,255,.86);font-size:10px;text-align:right;word-break:break-word}
    `;
    document.head.appendChild(style);

    setTimeout(() => {
      if (model.activePanel === 'recon' || model.activePanel === 'search') {
        model.activePanel = '';
        model.searchText = '';
        deck.classList.remove('open', 'compact-selected', 'node-detail');
      }
    }, 150);
  }

  wait();
})();
