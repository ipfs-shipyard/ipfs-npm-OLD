var fs = require('fs')
var path = require('path')
var subcom = require('subcomandante')
var W = require('watt').wrap

var readPackage = W(function * (modulePath, w) {
  var raw = yield fs.readFile(packagePath(modulePath), w)
  return JSON.parse(raw.toString())
})

var savePackage = W(function * (modulePath, data, w) {
  var raw = JSON.stringify(data, null, '  ')
  yield fs.writeFile(packagePath(modulePath), raw, w)
})

var run = W(function * (cmd, args, opts, w) {
  if (typeof args === 'function') {
    w = args
    args = []
    opts = {}
  } else if (typeof opts === 'function') {
    w = opts
    opts = {}
  }
  var c = subcom(cmd, args, opts, w)
  var res = yield c.once('exit', w.arg(0))
  if (res !== 0) {
    throw yield c.once('error', w.arg(0))
  }
})

var resolveRequire = W(function * (from, name, w) {
  var modulePath = path.join(from, 'node_modules', name)
  if (yield exists(modulePath, w)) return modulePath
  var up = path.dirname(from)
  if (up === '.') {
    throw new Error('Could not resolve "' + name + '" from "' + from + '"')
  }
  return yield resolveRequire(up, name, w)
})

function randomString () {
  return Math.random().toString(36).slice(3)
}

function exists (filename, cb) {
  fs.lstat(filename, function (err, stat) {
    if (err && err.code !== 'ENOENT') return cb(err)
    cb(null, !!stat)
  })
}

function maybeJoin (basename) {
  return function (p) {
    if (path.basename(p) === basename) return p
    return path.join(p, basename)
  }
}

var packagePath = maybeJoin('package.json')
var modulesPath = maybeJoin('node_modules')

function getTempDir () {
  var dirname = 'inpm-' + process.pid + '-' + randomString()
  return path.join(process.env.TMPDIR || '/tmp', dirname)
}

function tarStrip (n) {
  return function (header) {
    var split = header.name.split(path.sep)
    header.name = split.slice(n).join(path.sep)
    return header
  }
}

module.exports = {
  readPackage,
  savePackage,
  run,
  randomString,
  exists,
  packagePath,
  modulesPath,
  getTempDir,
  resolveRequire,
  tarStrip
}
