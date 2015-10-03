#!/usr/bin/env node

var args = require('minimist')(process.argv)
var path = require('path')
var W = require('watt').run
require('colors')

var INPM_PATH = process.env.INPM_PATH || path.join(process.env.HOME, '.inpm')
process.env.INPM_PATH = INPM_PATH

var inpm = require('../lib/inpm.js')(INPM_PATH)

W(function * (w) {
  try {
    var pkg = yield inpm.install(path.resolve('.'), w)
    console.log('installed %s successfully'.green, (pkg.name + '@' + pkg.version).bold)
    process.exit(0)
  } catch (err) {
    console.error('%s %s', 'error:'.red.bold, err.message)
    console.error(err.stack.gray)
    process.exit(1)
  }
})
