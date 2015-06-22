'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var windosu = require('windosu');

module.exports = function(kbox) {

  var meta = require('./meta.js')(kbox);
  var util = require('./util.js')(kbox);
  var provider = kbox.engine.provider;
  var KALABOX_DNS_OPTIONS = [];
  var provisioned = kbox.core.deps.lookup('globalConfig').provisioned;
  var serviceInfo = require('./services.js')(kbox);
  var Promise = kbox.promise;

  var engineDep = (provisioned) ? 'engine-docker-prepared' : 'engine-up';
  kbox.install.registerStep(function(step) {
    step.name = 'services-kalabox-install';
    step.deps = [engineDep];
    step.description = 'Installing images for services...';
    step.all = function(state, done) {
      kbox.services.install()
      .catch(function(err) {
        state.status = false;
        throw err;
      })
      .nodeify(done);
    };
  });

  if (!provisioned) {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-is-dns-set';
      step.description = 'Checking if dns is set...';
      step.deps = ['engine-docker-provider-profile'];
      step.all.darwin = function(state) {
        state.dnsIsSet = fs.existsSync(path.join(
            meta.dns.darwin.path,
            meta.dns.darwin.file
          )
        );
        var msg = state.dnsIsSet ? 'is set.' : 'is not set.';
        state.log.debug('DNS ' + msg);
      };
      step.all.linux = function(state, done) {
        // Get list of possible kalabox ips.
        provider().call('getServerIps')
        // Add dns servers to list of dns options.
        .then(function(ips) {
          // Get list of dns server configured on this linux host.
          return util.getLinuxDnsServers()
          .then(function(dnsServers) {
            // If list of configured dns servers doesn't include this
            // IP then add it.
            _.each(ips, function(ip) {
              if (!_.contains(dnsServers, ip)) {
                var s = ['nameserver', ip].join(' ');
                KALABOX_DNS_OPTIONS.push(s);
              }
            });
          });
        })
        // Update dns is set in state.
        .then(function() {
          state.dnsIsSet = _.isEmpty(KALABOX_DNS_OPTIONS);
          var msg = state.dnsIsSet ? 'is set.' : 'is not set.';
          state.log.debug('DNS ' + msg);
        })
        // Return.
        .nodeify(done);

      };
      step.all.win32 = function(state, done) {
        // @todo: actually do a check of some kind?
        state.dnsIsSet = false;
        done();
      };
    });

    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-install-dns-deps';
      step.description  = 'Queuing up services admin commands...';
      step.deps = ['services-kalabox-is-dns-set'];
      step.subscribes = ['core-run-admin-commands'];
      step.all.darwin = function(state, done) {
        if (!state.dnsIsSet) {
          // Get list of server ips.
          provider().call('getServerIps')
          // Add dns setup command.
          .then(function(ips) {
            var ipCmds = kbox.install.cmd.buildDnsCmd(
              ips, [meta.dns.darwin.path, meta.dns.darwin.file]
            );
            var cmd = ipCmds.join(' && ');
            state.adminCommands.push(cmd);
          })
          // Return.
          .nodeify(done);
        } else {
          done();
        }
      };
      step.all.linux = function(state) {
        if (!state.dnsIsSet) {
          var flavor = kbox.install.linuxOsInfo.getFlavor();
          // @todo: more flavors
          if (flavor === 'debian') {
            state.adminCommands.push('apt-get install resolvconf -y');
          }
        }
      };
    });

    // @todo: really wish we could figure out how to do this as part of normal
    // admin install step or at least something that only shows on windows
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-finalize';
      step.description = 'Finalizing Services...';
      step.deps = ['services-kalabox-install'];
      step.all.linux = function(state, done) {
        if (!state.dnsIsSet) {
          var flavor = kbox.install.linuxOsInfo.getFlavor();
          var dis = (flavor === 'debian') ? flavor : 'linux';
          var dnsCmds = kbox.install.cmd.buildDnsCmd(
            KALABOX_DNS_OPTIONS,
            [meta.dns.linux[dis].path, meta.dns.linux[dis].file]
          );
          dnsCmds.push('resolvconf -u');
          if (!_.isEmpty(dnsCmds)) {
            var child = kbox.install.cmd.runCmdsAsync(dnsCmds, state);
            child.stdout.on('data', function(data) {
              state.log.debug(data);
            });
            child.stdout.on('end', function() {
              state.log.debug('Finished installing');
              done();
            });
            child.stderr.on('data', function(data) {
              state.log.debug(data);
            });
          }
        } else {
          done();
        }
      };
      step.all.win32 = function(state, done) {
        // Get shell library.
        var shell = kbox.core.deps.get('shell');
        // Get network information from virtual box.
        return Promise.fromNode(function(cb) {
          var cmd = '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe" ' +
            'showvminfo "Kalabox2" | findstr "Host-only"';
          shell.exec(cmd, cb);
        })
        .then(function(output) {
          // Parse output to get network adapter information.
          var start = output.indexOf('\'');
          var last = output.lastIndexOf('\'');
          var adapter = [
            output.slice(start + 1, last).replace(
              'Ethernet Adapter',
              'Network'
            )
          ];
          // Get list of server IPs.
          return provider().call('getServerIps')
          // Setup DNS.
          .then(function(ips) {
            var ipCmds = kbox.install.cmd.buildDnsCmd(
              ips, adapter
            );
            var cmd = ipCmds.join(' && ');
            state.log.debug(cmd);
            return Promise.fromNode(function(cb) {
              windosu.exec(cmd, cb);
            })
            .then(function(output) {
              state.log.debug(output);
            });
          });
        })
        // Return.
        .nodeify(done);
      };
      step.all.darwin = function(state, done) {
        done();
      };
    });
  }

  if (provisioned) {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-image-prepare';
      step.subscribes = ['core-image-prepare'];
      step.deps = ['core-auth'];
      step.description = 'Submitting core service images for updates.';
      step.all = function(state, done) {
        serviceInfo.getStartableServices().forEach(function(service) {
          state.containers.push(service.createOpts.name);
        });
        done();
      };
    });
  }

};
