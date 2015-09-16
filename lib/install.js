'use strict';

module.exports = function(kbox) {

  // Native modules
  var fs = require('fs');
  var path = require('path');

  // NPM modules
  var _ = require('lodash');
  var windosu = require('windosu');

  // Kalabox modules
  var meta = require('./meta.js')(kbox);
  var util = require('./util.js')(kbox);
  var provider = kbox.engine.provider;
  var serviceInfo = require('./services.js')(kbox);
  var Promise = kbox.Promise;

  // "Constants"
  var KALABOX_DNS_OPTIONS = [];

  /*
   * Submit core images for install
   */
  if (util.needsImages()) {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-install';
      step.deps = ['core-auth'];
      step.subscribes = ['core-image-build'];
      step.description = 'Adding services images to build list...';
      step.all = function(state) {

        // Grab the core services
        var images = serviceInfo.getCoreImages();

        // Cycle through and add each image to our list
        _.forEach(images, function(image) {
          state.images.push(image);
        });

      };
    });
  }

  /*
   * Rebuild core service images if needed
   */
  if (util.needsImages()) {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-rebuild';
      step.deps = ['core-image-build'];
      step.description = 'Creating services...';
      step.all = function(state, done) {

        // Start the installer
        kbox.services.rebuild()

        // Catch any errors and fail the installer
        .catch(function(err) {
          state.fail(state, err);
        })

        // If we've gotten this far we can update our current install
        .then(function() {

          // Update our current install if no errors have been thrown
          if (state.status) {
            state.updateCurrentInstall({SERVICE_IMAGES_VERSION: '0.10.0'});
          }

        })

        .nodeify(done);
      };
    });
  }

/*
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

/*

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
      // For some reason we have to declare this again?
      // @todo?
      var Promise = kbox.Promise;
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
*/

};
