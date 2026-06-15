'use strict';

(function () {
  const VERSION = '20260614-real-aeris-launcher-fixed-path';
  const REPO_SEGMENT = '/osiris-v2';

  function repoBasePath() {
    const path = window.location.pathname || '/';
    const index = path.toLowerCase().indexOf(REPO_SEGMENT.toLowerCase());
    if (index >= 0) return path.slice(0, index + REPO_SEGMENT.length);
    return '';
  }

  function aerisUrl() {
    return `${window.location.origin}${repoBasePath()}/aeris/city/dxr/`;
  }

  function goToAeris(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
    window.location.assign(aerisUrl());
  }

  function installLauncher() {
    const button = document.getElementById('aerisModeToggle') || document.querySelector('.aeris-toggle');
    if (!button) return;
    if (button.__osirisRealAerisLauncher === VERSION) return;
    button.__osirisRealAerisLauncher = VERSION;
    button.textContent = 'AERIS';
    button.setAttribute('aria-label', 'Open real Aeris 3D flight radar');
    button.setAttribute('data-aeris-target', aerisUrl());

    for (const eventName of ['click', 'touchend', 'pointerup']) {
      button.addEventListener(eventName, goToAeris, { capture: true, passive: false });
    }
  }

  function install() {
    installLauncher();
    const observer = new MutationObserver(installLauncher);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__osirisAerisLauncher = { version: VERSION, url: aerisUrl, open: goToAeris };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
