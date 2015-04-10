'use strict';

/**
 * This contains all the core commands that kalabox can run on every machine
 */

var fs = require('fs');
var fileinput = require('fileinput');
var path = require('path');
var S = require('string');
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
  };

  return {
    getLinuxDNSOptions: getLinuxDNSOptions,
    dnsInfo: dnsInfo
  };

};
