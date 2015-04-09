'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');

module.exports = function(kbox) {

  var meta = require('./meta.js')(kbox);
  var util = require('./util.js')(kbox);
  var provider = kbox.engine.provider;
  var KALABOX_DNS_OPTIONS = [];

  kbox.install.registerStep(function(step) {
    step.name = 'services-kalabox-is-dns-set';
    step.description = 'Checking if dns is set.';
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
      provider.getServerIps(function(ips) {
        util.getLinuxDNSOptions(function(options) {
          _.forEach(ips, function(ip) {
            if (!_.contains(options, ip)) {
              KALABOX_DNS_OPTIONS.push('nameserver ' + ip);
            }
          });
          state.dnsIsSet = (_.isEmpty(KALABOX_DNS_OPTIONS)) ? true : false;
          var msg = state.dnsIsSet ? 'is set.' : 'is not set.';
          state.log.debug('DNS ' + msg);
          done();
        });
      });
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
    step.all.darwin = function(state) {
      if (!state.dnsIsSet) {
        provider.getServerIps(function(ips) {
          var ipCmds = kbox.install.cmd.buildDnsCmd(
            ips, [meta.dns.darwin.path, meta.dns.darwin.file]
          );
          var cmd = ipCmds.join(' && ');
          state.adminCommands.push(cmd);
        });
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

  kbox.install.registerStep(function(step) {
    step.name = 'services-kalabox-install';
    step.description = 'Installing images for services...';
    step.deps = ['engine-docker-up'];
    step.all = function(state, done) {
      kbox.services.install(function(err) {
        if (err) {
          state.status = false;
          done(err);
        } else {
          done();
        }
      });
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
          var child = kbox.install.cmd.runCmdsAsync(dnsCmds);
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
      kbox.core.deps.call(function(shell) {
        var nic = '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe" ' +
          'showvminfo "Kalabox2" | findstr "Host-only"';
        shell.exec(nic, function(err, output) {
          if (err) {
            done(err);
          }
          else {
            var start = output.indexOf('\'');
            var last = output.lastIndexOf('\'');
            var adapter = [
              output.slice(start + 1, last).replace(
                'Ethernet Adapter',
                'Network'
              )
            ];
            state.log.debug(adapter);
            provider.getServerIps(function(ips) {
              var ipCmds = kbox.install.cmd.buildDnsCmd(
                ips, adapter
              );
              var child = kbox.install.cmd.runCmdsAsync(ipCmds);
              state.log.debug(ipCmds);
              child.stderr.on('data', function(data) {
                state.log.debug(data);
                done(data);
              });
              child.stdout.on('data', function(data) {
                state.log.debug(data);
              });
              child.on('exit', function(code) {
                state.log.debug('Install completed with code ' + code);
                done();
              });
            });
          }
        });
      });
    };
    step.all.darwin = function(state, done) {
      done();
    };
  });

};
