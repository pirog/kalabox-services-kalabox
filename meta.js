'use strict';

module.exports = function(kbox) {

  var deps = kbox.core.deps;

  return {
    dns: {
      darwin: {
        path: '/etc/resolver',
        file: deps.lookup('globalConfig').domain,
      },
      linux: {
        debian: {
          path: '/etc/resolvconf/resolv.conf.d',
          file: 'head'
        },
        other: {
          path: '/etc',
          file: 'resolv.conf'
        }
      }
    }
  };

};
