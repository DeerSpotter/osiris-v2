(() => {
  const STARTED = Date.now();
  const MAX_WAIT_MS = 15000;

  function injectToggle() {
    let button = document.getElementById('satelliteToggle');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'satelliteToggle';
    button.type = 'button';
    button.className = 'satellite-toggle';
    button.setAttribute('aria-label', 'Toggle satellite map mode');
    button.innerHTML = '<span>SAT</span>';
    document.body.appendChild(button);
    return button;
  }

  function injectStyle() {
    if (document.getElementById('satelliteToggleStyles')) return;
    const style = document.createElement('style');
    style.id = 'satelliteToggleStyles';
    style.textContent = `
      .satellite-toggle{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 82px);z-index:520;width:52px;height:52px;border:1px solid rgba(215,183,57,.42);border-radius:18px;background:rgba(5,7,17,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5d96b;box-shadow:0 12px 34px rgba(0,0,0,.46),inset 0 0 18px rgba(215,183,57,.08);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;display:grid;place-items:center;touch-action:manipulation;}
      .satellite-toggle.active{background:rgba(215,183,57,.24);border-color:rgba(245,217,107,.88);color:#fff;text-shadow:0 0 10px rgba(245,217,107,.76);}
      .satellite-toggle:active{transform:scale(.96);}
      @media(max-width:760px){.satellite-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 78px);width:48px;height:48px;border-radius:16px;}}
    `;
    document.head.appendChild(style);
  }

  function syncButton(button) {
    const active = document.body.classList.contains('osiris-satellite-mode');
    button.classList.toggle('active', active);
    button.querySelector('span').textContent = active ? 'MAP' : 'SAT';
  }

  function install() {
    injectStyle();
    const button = injectToggle();
    const wait = () => {
      if (!window.__osirisRealMap || typeof window.__osirisSetBasemap !== 'function') {
        if (Date.now() - STARTED < MAX_WAIT_MS) setTimeout(wait, 80);
        return;
      }
      syncButton(button);
      button.addEventListener('click', () => {
        const next = document.body.classList.contains('osiris-satellite-mode') ? 'dark' : 'satellite';
        window.__osirisSetBasemap(next, true);
        setTimeout(() => syncButton(button), 60);
      });
      document.addEventListener('osiris:basemap', () => syncButton(button));
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();