'use strict';

(function () {
  const VERSION = '20260614-real-aeris-launcher';

  function aerisUrl() {
    return new URL('./aeris/city/dxr/', window.location.href).href;
  }

  function installLauncher() {
    const button = document.getElementById('aerisModeToggle') || document.querySelector('.aeris-toggle');
    if (!button || button.__osirisRealAerisLauncher) return;
    button.__osirisRealAerisLauncher = true;
    button.textContent = 'AERIS';
    button.setAttribute('aria-label', 'Open real Aeris 3D flight radar');
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.location.href = aerisUrl();
      },
      true,
    );
  }

  function install() {
    installLauncher();
    const observer = new MutationObserver(installLauncher);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__osirisAerisLauncher = { version: VERSION, url: aerisUrl };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
