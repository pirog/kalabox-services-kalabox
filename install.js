'use strict';

var fs = require('fs');

module.exports = function(kbox) {

  var meta = require('./meta.js')(kbox);
  var provider = kbox.engine.provider;

  // Boot2docker profile set?
  kbox.install.registerStep(function(step) {
    step.name = 'is-dns-set';
    step.description = 'Check if dns is set.';
    step.deps = [];
    step.all.darwin = function(state, done) {
      state.log('Checking if DNS is set.');
      state.dnsIsSet = fs.existsSync(meta.dns.darwin);
      var msg = state.dnsIsSet ? 'is set.' : 'is not set.';
      state.log('DNS ' + msg);
      done();
    };
  });

  kbox.install.registerStep(function(step) {
    step.name = 'install-dns';
    step.description  = 'Setting up DNS.';
    step.deps = [];
    step.subscribes = ['run-admin-commands'];
    step.all.darwin = function(state, done) {
      if (!state.dnsIsSet) {
        state.log('Setting up DNS for Kalabox.');
        provider.getServerIps(function(ips) {
          var ipCmds = kbox.install.cmd.buildDnsCmd(
            ips, [meta.dns.darwin]
          );
          state.adminCommands.concat(ipCmds);
          done();
        });
      }
    };
  });

  // Install services.
  kbox.install.registerStep(function(step) {
    step.name = 'kalabox-services-kalabox';
    step.description = 'Install kalabox-services-kalabox plugin services.';
    step.deps = ['init-engine'];
    step.all = function(state, done) {
      kbox.services.install(function(err) {
        if (err) {
          state.log(state.status.notOk);
          done(err);
        } else {
          state.log(state.status.ok);
          done();
        }
      });
    };
  });

};
