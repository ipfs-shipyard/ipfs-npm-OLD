#!/usr/bin/env node --harmony

var args = require('minimist')(process.argv)
var path = require('path')

var INPM_PATH = process.env.INPM_PATH || path.join(process.env.HOME, '.inpm')
process.env.INPM_PATH = INPM_PATH

var inpm = require('../lib/inpm.js')(INPM_PATH)

inpm.install(path.resolve('.'), function (err, res) {
  console.log(err, err.stack)
})
