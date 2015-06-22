'use strict';

/**
 * This contains all the core commands that kalabox can run on every machine
 */

var fs = require('fs');
var fileinput = require('fileinput');
var path = require('path');
var _ = require('lodash');

module.exports = function(kbox) {

  var meta = require('./meta.js')(kbox);
  var Promise = kbox.Promise;
  /*
   * Return linux dns information.
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
    getLinuxDnsServers: getLinuxDnsServers
  };

};
