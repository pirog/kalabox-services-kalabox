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

        // Next step
        .nodeify(done);

      };
    });
  }

  /*
   * Queue up admin commands we might need for DNS set up
   */
  if (util.needsDNS()) {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-admin';
      step.description  = 'Queuing up services admin commands...';
      step.deps = ['core-auth'];
      step.subscribes = ['core-run-admin-commands'];
      step.all.linux = function(state) {

        // Grab our linux flavor
        var flavor = kbox.install.linuxOsInfo.getFlavor();

        // @todo: more flavors
        // Add in our admin command if needed on the correct flava flav
        if (util.needsLinuxDNS()) {
          if (flavor === 'debian') {
            state.adminCommands.push('apt-get install resolvconf -y');
          }
        }

      };
    });
  }

  /*
   * Sets up our DNS after we've pulled our images and we can ensure the profile
   * is set up correctly
   * @todo: really wish we could figure out how to do this as part of normal
   * admin install step or at least something that only shows on windows
   */
  if (util.needsDNS()) {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-finalize';
      step.description = 'Setting up DNS...';
      step.deps = ['core-image-build'];
      step.all.linux = function(state, done) {

        // Start up a collector
        var dnsCmds = [];
        // Grab linux flavor
        var flavor = kbox.install.linuxOsInfo.getFlavor();
        // Grab a generic dis
        var dis = (flavor === 'debian') ? flavor : 'linux';

        // Check out what we need to add
        return util.getLinuxDNStoAdd()

        // Put together some commands if we need to
        .then(function(ips) {
          if (util.needsLinuxDNS()) {
            var dnsFile = [meta.dns.linux[dis].path, meta.dns.linux[dis].file];
            dnsCmds.push(kbox.install.cmd.buildDnsCmd(ips, dnsFile));
            dnsCmds.push('resolvconf -u');
          }
        })

        // Run those commands if we have commands to run
        .then(function() {
          if (_.isEmpty(dnsCmds)) {
            done();
          }
          else {
            util.runCmds(dnsCmds, state, done);
          }
        });

      };
      step.all.win32 = function(state, done) {

        // Start up a collector
        var dnsCmds = [];

        // Grab the appropriate windows network adapter
        return util.getWindowsAdapter()

        // Generate teh DNS commands and run it
        .then(function(adapter) {

          // Get list of server IPs.
          return provider().call('getServerIps')

          .then(function(ips) {
            if (util.needsWin32DNS()) {
              dnsCmds.push(kbox.install.cmd.buildDnsCmd(ips, adapter));
              var cmd = dnsCmds.join(' && ');
              return Promise.fromNode(function(cb) {
                windosu.exec(cmd, cb);
              })
              .then(function(output) {
                state.log.debug(output);
              });
            }
          });

        })

        // Next step
        .nodeify(done);

      };
      step.all.darwin = function(state, done) {

        // Start up a collector
        var dnsCmds = [];

        // Get list of server ips.
        provider().call('getServerIps')

        // Add dns setup command.
        .then(function(ips) {
          if (util.needsDarwinDNS()) {
            var dnsFile = [meta.dns.darwin.path, meta.dns.darwin.file];
            var ipCmds = kbox.install.cmd.buildDnsCmd(ips, dnsFile);
            var cmd = ipCmds.join(' && ');
            dnsCmds.push(cmd);
          }
        })

        // Try to install DNS if we have commands to run
        .then(function() {
          if (_.isEmpty(dnsCmds)) {
            done();
          }
          else {
            util.runCmds(dnsCmds, state, done);
          }
        });

      };
    });
  }
};
