var fs = require('fs')
var mkdirp = require('mkdirp')
var npm = require('./npm.js')
var path = require('path')
var rm = require('rimraf')
var utils = require('./utils.js')
var W = require('watt').wrap

module.exports = function (inpmPath) {
  var registry = require('./registry.js')(inpmPath)

  var dependencyKeys = [ 'dependencies', 'optionalDependencies' ]

  var install = W(function * (modulePath, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    var pkg = yield utils.readPackage(modulePath, w)
    pkg.ipfs = pkg.ipfs || {}
    console.log('ipfsifying %s@%s', pkg.name, pkg.version)

    for (var key of dependencyKeys) {
      if (!pkg[key]) continue
      pkg.ipfs[key] = pkg.ipfs[key] || {}
      for (var depName in pkg[key]) {
        var tempPath = utils.getTempDir()
        yield mkdirp(tempPath, w)
        yield npm.fetch(depName, pkg[key][depName], tempPath, w)
        var depPkg = yield utils.readPackage(tempPath, w)

        var ipfsPath
        if (yield registry.has(depName, depPkg.version, w)) {
          var regPath = registry.path(depPkg)
          ipfsPath = yield fs.readlink(regPath, w)
        } else {
          yield install(tempPath, w)
          ipfsPath = (yield registry.add(tempPath, w)).ipfsPath
        }

        pkg.ipfs[key][depName] = ipfsPath
      }
    }

    var nodeModulesPath = path.join(modulePath, 'node_modules')
    yield mkdirp(nodeModulesPath, w)
    for (var key of dependencyKeys) {
      if (!pkg.ipfs[key]) continue
      for (var depName in pkg.ipfs[key]) {
        var ipfsPath = pkg.ipfs[key][depName]
        var depPath = path.join(nodeModulesPath, depName)
        yield rm(depPath, w)
        yield fs.symlink(ipfsPath, depPath, w)
      }
    }

    yield utils.savePackage(modulePath, pkg, w)
  })

  return {
    install
  }
}
