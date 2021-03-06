var concat = require('concat-stream')
var fs = require('fs')
var mkdirp = require('mkdirp')
var path = require('path')
var semver = require('semver')
var utils = require('./utils.js')
var W = require('watt').wrap

var ignoreFiles = new Set([ '.git', 'CVS', '.svn', '.hg' ])

module.exports = function (inpmPath) {
  var REGISTRY_PATH = path.join(inpmPath, 'node_modules')
  var ipfs = require('./ipfs.js')(inpmPath)

  function getPath (name, version) {
    if (typeof name === 'object') {
      version = name.version
      name = name.name
    }
    return path.join(REGISTRY_PATH, name, version)
  }

  var includedPaths = W(function * (dirPath, w) {
    var output = []
    var dir = yield fs.readdir(dirPath, w)
    // TODO: .npmignore, .inpmignore
    for (var filename of dir) {
      if (ignoreFiles.has(filename)) continue
      output.push(path.join(dirPath, filename))
    }
    return output
  })

  // adds a module to IPFS and the local registry
  var add = W(function * (modulePath, w) {
    var pkg = yield utils.readPackage(modulePath, w)
    var regPath = getPath(pkg)
    if (yield has(pkg.name, pkg.version, w)) {
      throw new Error(pkg.name + '@' + pkg.version + ' is already in the registry')
    }
    yield mkdirp(path.dirname(regPath), w)
    var paths = yield includedPaths(modulePath, w)
    var ipfsApi = yield ipfs.getApi(w)
    var add = yield ipfsApi.send('add', null, {
      recursive: true,
      hidden: true,
      'wrap-with-directory': true,
      followSymlinks: false
    }, paths, w)
    var ipfsPath = '/ipfs/' + add[add.length - 1].Hash
    yield fs.symlink(ipfsPath, regPath, w)
    return { ipfsPath, regPath, pkg }
  })

  var latestVersion = W(function * (name, range, w) {
    var vs = yield versions(name, w)
    var latest = semver.maxSatisfying(vs, range)
    if (!latest) {
      throw new Error('No versions of "' + name + '" in the local registry satisfy "' + range + '"')
    }
    return latest
  })

  var get = W(function * (name, range, w) {
    var latest = yield latestVersion(name, range, w)
    var regPath = getPath(name, latest)
    var ipfsPath = yield fs.readlink(regPath, w)
    var ipfsApi = yield ipfs.getApi(w)
    var pkgStream = yield ipfsApi.cat(path.join(ipfsPath, 'package.json'), w)
    var pkgRaw = yield pkgStream.pipe(concat(w.arg(0)))
    var pkg = JSON.parse(pkgRaw.toString())
    return { ipfsPath, regPath, pkg }
  })

  var has = W(function * (name, version, w) {
    return yield utils.exists(getPath(name, version), w)
  })

  var versions = W(function * (name, w) {
    var modulePath = path.join(REGISTRY_PATH, name)
    if (!(yield utils.exists(modulePath, w))) {
      throw new Error('"' + name + '" is not in the local registry')
    }
    var versions = yield fs.readdir(modulePath, w)
    return versions.sort(semver.gt)
  })

  return {
    path: getPath,
    includedPaths,
    add,
    latestVersion,
    get: get,
    has,
    versions
  }
}
