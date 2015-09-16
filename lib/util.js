'use strict';

/**
 * This contains all helper methods for the services install
 */

module.exports = function(kbox) {

  // Native modules
  var fs = require('fs');
  var path = require('path');

  // Npm modules
  var _ = require('lodash');
  var fileinput = require('fileinput');

  // Kalabox modules
  var meta = require('./meta.js')(kbox);
  var Promise = kbox.Promise;
  var config = kbox.core.deps.get('globalConfig');

  /*
   * Return some info about the current state of the kalabox installation
   */
  var getCurrentInstall = function(installDetails) {

    // This is where our current install file should live
    var cIF = path.join(config.sysConfRoot, 'installed.json');

    // If the file exists use that if not empty object
    var currentInstall = (fs.existsSync(cIF)) ? require(cIF) : {};

    return currentInstall;

  };

  /*
   * Helper function to grab and compare a meta prop
   */
  var getProUp = function(prop) {

    // Get details about the state of the current installation
    var currentInstall = getCurrentInstall();

    // This is the first time we've installed so we def need
    if (_.isEmpty(currentInstall) || !currentInstall[prop]) {
      return true;
    }

    // We have a syncversion to compare
    // @todo: is diffence a strong enough check?
    var nV = meta[prop];
    if (currentInstall[prop] && (currentInstall[prop] !== nV)) {
      return true;
    }

    // Hohum i guess we're ok
    return false;

  };

  /*
   * Helper function to assess whether we need a new B2D
   */
  var needsImages = function() {
    return getProUp('SERVICE_IMAGES_VERSION');
  };

  /*
   * Return linux dns information.
   * @todo: clean this up
   */
  var getLinuxDnsServers = _.once(function() {

    // Get linux flavor.
    var flavor = kbox.install.linuxOsInfo.getFlavor();

    // Get linux flavor distribution.
    var distro = (flavor === 'debian') ? flavor : 'linux';

    // Build path to dns file.
    var dnsFilepath = path.join(
      meta.dns.linux[distro].path,
      meta.dns.linux[distro].file
    );

    // Read dns file.
    return Promise.fromNode(function(cb) {
      fs.readFile(dnsFilepath, {encoding: 'utf8'}, cb);
    })
    // If file does not exist return false otherwise throw error.
    .catch(function(err) {
      if (err.code === 'ENOENT') {
        return '';
      } else {
        throw err;
      }
    })
    // Split data read from file into lines.
    .then(function(data) {
      return data.split('\n');
    })
    // Filter out uninteresting lines.
    .filter(function(line) {
      var isComment = _.startsWith(line, '#');
      var hasSpaces = _.contains(line, ' ');
      // Filter out comments, and only include lines which contain spaces.
      return !isComment && hasSpaces;
    })
    // Reduce remaining lines into an array of name servers.
    .reduce(function(dnsServers, line) {
      // Split each line, trim the parts, and remove double quotes.
      var parts = _.chain(line.split(' '))
        .map(_.trim)
        .map(function(part) {
          return part.replace(/"/g, '');
        })
        .value();
      // If parts array starts with nameserver, the second element is a
      // dns nameserver, so add it to the list of dns servers.
      if (parts[0] === 'nameserver') {
        dnsServers.push(parts[1]);
      }
      return dnsServers;
    }, []);
  });

  return {
    getLinuxDnsServers: getLinuxDnsServers,
    needsImages: needsImages
  };

};
