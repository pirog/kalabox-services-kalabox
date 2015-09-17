'use strict';

module.exports = function(kbox) {

  // Native modules
  var path = require('path');

  // NPM modules
  var _ = require('lodash');

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
   * @todo: a way to check this dep without needing the profile?
   * possibly just searching to see if resolveconf is installed
   */
  kbox.install.registerStep(function(step) {
    step.name = 'services-kalabox-admin';
    step.description  = 'Queuing up services admin commands...';
    step.subscribes = ['core-run-admin-commands'];
    step.all.linux = function(state, done) {

      // Check if we need to add a DNS command
      return util.needsDNSAdmin()

      .then(function(needsCommand) {
        if (needsCommand) {
          if (kbox.install.linuxOsInfo.getFlavor() === 'debian') {
            state.adminCommands.push('apt-get install resolvconf -y');
          }
        }
      })

      .nodeify(done);

    };
  });

  /*
   * Sets up our DNS after we've pulled our images and we can ensure the profile
   * is set up correctly
   */
  if (util.needsDNS() || process.platform === 'linux') {
    kbox.install.registerStep(function(step) {
      step.name = 'services-kalabox-finalize';
      step.description = 'Setting up DNS...';
      step.deps = ['core-image-build'];
      step.all.linux = function(state, done) {

        // Set up Linux DNS
        util.setupLinuxDNS(state)

        // Fail step if we catch an error
        .catch(function(err) {
          state.fail(state, err);
        })

        // Next Step
        .nodeify(done);

      };
      step.all.win32 = function(state, done) {

        // Set up darwin DNS
        util.setupWindowsDNS(state)

        // Fail step if we catch an error
        .catch(function(err) {
          state.fail(state, err);
        })

        // Next Step
        .nodeify(done);

      };
      step.all.darwin = function(state, done) {

        // Set up darwin DNS
        util.setupDarwinDNS(state)

        // Fail step if we catch an error
        .catch(function(err) {
          state.fail(state, err);
        })

        // Next Step
        .nodeify(done);

      };
    });
  }
};
