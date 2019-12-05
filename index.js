"use strict";

var HorusOauthSecurityStrategy = require('./HorusOauthSecurityStrategy');

function HorusWebClientPlugin() {

  this.getSecurityStrategy = function(expressIntance, options) {
    return new HorusOauthSecurityStrategy(expressIntance, options);
  }
}

module.exports = HorusWebClientPlugin;
