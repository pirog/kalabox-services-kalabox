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

  var dnsInfo = [];
  var getLinuxDNSOptions = function(callback) {
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
          var current = _.trim(line.toString('utf8'));
          if (!_.startsWith(current, '#') && !_.isEmpty(current)) {
            if (_.contains(current, ' ')) {
              var pieces = current.split(' ');
              if (_.trim(pieces[0]) === 'nameserver') {
                dnsInfo.push(_.trim(pieces[1].replace(/"/g, '')));
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
  };

  return {
    getLinuxDNSOptions: getLinuxDNSOptions,
    dnsInfo: dnsInfo
  };

};
