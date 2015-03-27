'use strict';

module.exports = function(kbox) {

  var deps = kbox.core.deps;

  return {
    dns: {
      darwin: '/etc/resolver/' + deps.lookup('globalConfig').domain,
      linux: {
        debian: '/etc/resolvconf/resolv.conf.d/head',
        other: '/etc/resolv.conf'
      }
    }
  }

};
