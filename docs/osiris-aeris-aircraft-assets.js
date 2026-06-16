'use strict';

(function () {
  const VERSION = '20260616-route-stale-aeris-assets-to-react';

  function getAerisPath() {
    return window.location.pathname.indexOf('/osiris-v2/') === 0 ? '/osiris-v2/aeris/city/dxr/' : '/aeris/city/dxr/';
  }

  function alreadyOnReactAerisRoute() {
    return /\/aeris\/city\/dxr\/?$/.test(window.location.pathname);
  }

  function routeToReactAeris() {
    if (alreadyOnReactAerisRoute()) return true;
    window.location.href = getAerisPath();
    return false;
  }

  function install() {
    window.__osirisAerisAircraftAssets = {
      version: VERSION,
      apply: routeToReactAeris,
      route: routeToReactAeris,
    };
    routeToReactAeris();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
