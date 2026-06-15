'use strict';

(function () {
  const VERSION = '20260615-react-aeris-route';

  function getAerisPath() {
    return window.location.pathname.indexOf('/osiris-v2/') === 0 ? '/osiris-v2/aeris/city/dxr/' : '/aeris/city/dxr/';
  }

  function goToAeris(event) {
    if (event) event.preventDefault();
    window.location.href = getAerisPath();
  }

  function installLauncher() {
    const button = document.getElementById('aerisModeToggle') || document.querySelector('.aeris-toggle');
    if (!button) return;
    if (button.__osirisReactAerisLauncher === VERSION) return;
    button.__osirisReactAerisLauncher = VERSION;
    button.textContent = 'AERIS';
    button.setAttribute('aria-label', 'Open React Aeris flight radar');
    button.addEventListener('click', goToAeris);
  }

  function install() {
    installLauncher();
    const observer = new MutationObserver(installLauncher);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__osirisAerisLauncher = { version: VERSION, open: goToAeris, path: getAerisPath };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
