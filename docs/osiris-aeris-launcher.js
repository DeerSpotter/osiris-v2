'use strict';

(function () {
  const VERSION = '20260615-local-aeris-launcher-no-route';
  const RETRY_MS = 180;
  const MAX_RETRIES = 20;

  function activateLocalAeris(attempt = 0) {
    if (typeof window.__osirisSetAerisMode === 'function') {
      window.__osirisSetAerisMode(true);
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
    installLauncher();
    const observer = new MutationObserver(installLauncher);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__osirisAerisLauncher = { version: VERSION, open: goToAeris, activate: activateLocalAeris };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
