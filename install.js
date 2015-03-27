'use strict';

var fs = require('fs');
var fileinput = require('fileinput');
var path = require('path');
var S = require('string');
var _ = require('lodash');

module.exports = function(kbox) {

  var meta = require('./meta.js')(kbox);
  var provider = kbox.engine.provider;
  var KALABOX_DNS_OPTIONS = [];

  var dnsInfo = [];
  function getCurrentDNSOptions(callback) {
    if (!_.isEmpty(dnsInfo)) {
      callback(dnsInfo);
    }
    var flavor = kbox.install.linuxOsInfo.getFlavor();
    var dis = (flavor === 'debian') ? flavor : 'linux';
    var dnsFile = path.join(meta.dns.linux[dis].path, meta.dns.linux[dis].file);
    var dnsExists = fs.existsSync(dnsFile);
    if (dnsExists) {
      var dnsFileInfo = new fileinput.FileInput([dnsFile]);
      dnsFileInfo
        .on('line', function(line) {
          var current = S(line.toString('utf8')).trim().s;
          if (!S(current).startsWith('#') && !S(current).isEmpty()) {
            if (S(current).include(' ')) {
              var pieces = current.split(' ');
              if (S(pieces[0]).trim().s === 'nameserver') {
                dnsInfo.push(S(pieces[1].replace(/"/g, '')).trim().s);
              }
            }
          }
        })
        .on('end', function() {
          callback(dnsInfo);
        });
    }
    else {
      callback(dnsInfo);
    }
  }

  // Boot2docker profile set?
  kbox.install.registerStep(function(step) {
    step.name = 'is-dns-set';
    step.description = 'Check if dns is set.';
    step.deps = ['boot2docker-profile'];
    step.all.darwin = function(state, done) {
      state.log('Checking if DNS is set.');
      state.dnsIsSet = fs.existsSync(path.join(
          meta.dns.darwin.path,
          meta.dns.darwin.file
        )
      );
      var msg = state.dnsIsSet ? 'is set.' : 'is not set.';
      state.log('DNS ' + msg);
      done();
    };
    step.all.linux = function(state, done) {
      provider.getServerIps(function(ips) {
        getCurrentDNSOptions(function(options) {
          _.forEach(ips, function(ip) {
            if (!_.contains(options, ip)) {
              KALABOX_DNS_OPTIONS.push('nameserver ' + ip);
            }
          });
          state.dnsIsSet = (_.isEmpty(KALABOX_DNS_OPTIONS)) ? true : false;
          var msg = state.dnsIsSet ? 'is set.' : 'is not set.';
          state.log('DNS ' + msg);
          done();
        });
      });
    };
  });

  kbox.install.registerStep(function(step) {
    step.name = 'install-dns-deps';
    step.description  = 'Setting up DNS.';
    step.deps = ['is-dns-set'];
    step.subscribes = ['run-admin-commands'];
    step.all.darwin = function(state, done) {
      if (!state.dnsIsSet) {
        state.log('Setting up DNS for Kalabox.');
        provider.getServerIps(function(ips) {
          var ipCmds = kbox.install.cmd.buildDnsCmd(
            ips, [meta.dns.darwin.path, meta.dns.darwin.file]
          );
          var cmd = ipCmds.join(' && ');
          state.adminCommands.push(cmd);
          done();
        });
      }
    };
    step.all.linux = function(state, done) {
      if (!state.dnsIsSet) {
        state.log('Setting up DNS for Kalabox.');
        var flavor = kbox.install.linuxOsInfo.getFlavor();
        if (flavor === 'debian') {
          state.adminCommands.push('apt-get install resolvconf -y');
        }
      }
      done();
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

  // Install dns
  // @todo: really wish we could figure out how to do this as part of normal
  // admin install step
  kbox.install.registerStep(function(step) {
    step.name = 'install-dns';
    step.description = 'Setting DNS';
    step.deps = ['kalabox-services-kalabox'];
    step.all.linux = function(state, done) {
      if (!state.dnsIsSet) {
        state.log('Setting up DNS for Kalabox.');
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
            state.log(data);
          });
          child.stdout.on('end', function() {
            state.log('Finished installing');
            done();
          });
          child.stderr.on('data', function(data) {
            state.log(data);
          });
        }
      }
    };
    step.all.darwin = function(state, done) {
      done();
    };
    step.all.win32 = function(state, done) {
      done();
    };
  });

};
