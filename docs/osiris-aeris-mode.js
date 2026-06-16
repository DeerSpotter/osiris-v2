'use strict';

(function () {
  const VERSION = '20260616-react-aeris-mode-route';

  function getAerisPath() {
    return window.location.pathname.indexOf('/osiris-v2/') === 0 ? '/osiris-v2/aeris/city/dxr/' : '/aeris/city/dxr/';
  }

  function openReactAeris() {
    const target = getAerisPath();
    if (window.location.pathname === target) return;
    window.location.href = target;
  }

  function installRedirectOnlyMode() {
    window.__osirisSetAerisMode = function setAerisMode(enabled) {
      if (enabled !== false) openReactAeris();
      return true;
    };

    window.__osirisAerisMode = {
      version: VERSION,
      open: openReactAeris,
      route: getAerisPath,
    };

    const button = document.getElementById('aerisModeToggle') || document.querySelector('.aeris-toggle');
    if (button && button.__osirisStaticAerisRedirect !== VERSION) {
      button.__osirisStaticAerisRedirect = VERSION;
      button.textContent = 'AERIS';
      button.setAttribute('aria-label', 'Open React Aeris flight radar');
      button.addEventListener('click', function routeAeris(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openReactAeris();
      }, { capture: true, passive: false });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installRedirectOnlyMode, { once: true });
  else installRedirectOnlyMode();
})();
