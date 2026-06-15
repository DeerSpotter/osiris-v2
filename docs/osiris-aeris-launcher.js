'use strict';

(function () {
  const VERSION = '20260615-local-aeris-launcher-deck-renderer';
  const RETRY_MS = 180;
  const MAX_RETRIES = 20;
  const ASSET_SCRIPT_ID = 'osirisAerisAircraftAssetsScript';
  const ASSET_SCRIPT_SRC = './osiris-aeris-aircraft-assets.js?v=20260615-aeris-deck-iconlayer';

  function loadAircraftAssets() {
    if (document.getElementById(ASSET_SCRIPT_ID)) {
      window.__osirisAerisAircraftAssets?.apply?.();
      return;
    }

    const script = document.createElement('script');
    script.id = ASSET_SCRIPT_ID;
    script.src = ASSET_SCRIPT_SRC;
    script.defer = true;
    script.onload = () => window.__osirisAerisAircraftAssets?.apply?.();
    document.body.appendChild(script);
  }

  function activateLocalAeris(attempt = 0) {
    loadAircraftAssets();

    if (typeof window.__osirisSetAerisMode === 'function') {
      window.__osirisSetAerisMode(true);
      window.setTimeout(() => window.__osirisAerisAircraftAssets?.apply?.(), 140);
      return true;
    }

    // The Aeris mode script builds the local UI as the map finishes booting.
    // Never navigate away to a missing GitHub Pages route; wait briefly instead.
    if (attempt < MAX_RETRIES) {
      window.setTimeout(() => activateLocalAeris(attempt + 1), RETRY_MS);
    } else {
      document.body.classList.add('osiris-aeris-mode');
      document.getElementById('aerisModeToggle')?.classList.add('active');
      window.dispatchEvent(new CustomEvent('osiris:aeris-launch-pending'));
      window.setTimeout(() => window.__osirisAerisAircraftAssets?.apply?.(), 140);
    }
    return false;
  }

  function goToAeris(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
    activateLocalAeris();
  }

  function installLauncher() {
    const button = document.getElementById('aerisModeToggle') || document.querySelector('.aeris-toggle');
    if (!button) return;
    if (button.__osirisLocalAerisLauncher === VERSION) return;
    button.__osirisLocalAerisLauncher = VERSION;
    button.textContent = 'AERIS';
    button.setAttribute('aria-label', 'Open local Aeris flight radar');
    button.removeAttribute('data-aeris-target');

    for (const eventName of ['click', 'touchend', 'pointerup']) {
      button.addEventListener(eventName, goToAeris, { capture: true, passive: false });
    }
  }

  function install() {
    loadAircraftAssets();
    installLauncher();
    const observer = new MutationObserver(installLauncher);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__osirisAerisLauncher = { version: VERSION, open: goToAeris, activate: activateLocalAeris };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
