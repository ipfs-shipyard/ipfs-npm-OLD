#!/usr/bin/env node

var args = require('minimist')(process.argv, {
  boolean: [ 'dev', 'production', 'd', 'dupe', 'duplicate', 'preserve' ]
})
var path = require('path')
var W = require('watt').run
require('colors')

var INPM_PATH = process.env.INPM_PATH || path.join(process.env.HOME, '.inpm')
process.env.INPM_PATH = INPM_PATH

var inpm = require('../lib/inpm.js')(INPM_PATH)
var opts = {
  dev: args.dev,
  production: args.production || process.env.NODE_ENV === 'production',
  duplicate: args.d || args.dupe || args.duplicate,
  preserve: args.preserve
}

W(function * (w) {
  try {
    var pkg = yield inpm.install(path.resolve('.'), opts, w)
    console.log('installed %s successfully'.green, (pkg.name + '@' + pkg.version).bold)
    process.exit(0)
  } catch (err) {
    console.error('%s %s', 'error:'.red.bold, err.message)
    console.error(err.stack.gray)
    process.exit(1)
  }
})
