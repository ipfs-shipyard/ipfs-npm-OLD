var fs = require('fs')
var mkdirp = require('mkdirp')
var npm = require('./npm.js')
var path = require('path')
var rm = require('rimraf')
var utils = require('./utils.js')
var W = require('watt').wrap

module.exports = function (inpmPath) {
  var registry = require('./registry.js')(inpmPath)

  var dependencyKeys = [ 'dependencies', 'optionalDependencies', 'devDependencies' ]

  // installs an npm registry package, with IPFS dependencies added to the package.json
  var ipfsify = W(function * (name, version, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    // check the npm registry for the latest version match,
    // then check if we already have that version in the local registry
    // TODO: if offline (no npm), use latest version match in local registry (if any)
    var latest = yield npm.latestVersion(name, version, w)
    if (yield registry.has(name, latest, w)) {
      console.log('  getting %s from registry...', name)
      return yield registry.get(name, latest, w)
    }

    // fetch package (without dependencies) from npm
    var tempPath = utils.getTempDir()
    yield mkdirp(tempPath, w)
    console.log('  fetching %s@%s...', name, latest)
    yield npm.fetch(name, latest, tempPath, w)

    // fetch the dependencies and install, then add this package to local registry
    yield install(tempPath, opts, w)
    console.log('  adding %s to registry...', name)
    return yield registry.add(tempPath, w)

    // TODO: create a DAG node which links to the dependencies, and to the unixfs directory
  })

  var install = W(function * (modulePath, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    var pkg = yield utils.readPackage(modulePath, w)
    var depth = opts.depth || 0
    var dev = opts.dev || !opts.production && !depth
    console.log('installing %s@%s', pkg.name, pkg.version)

    // TODO: run preinstall scripts. not sure how to handle this:
    // (if the script modifies files, it shouldn't affect the IPFS root of the package,
    // we should possible duplicate the package locally so the changes live outside of
    // the local registry)

    // get paths of IPFSified dependencies
    var ipfsDeps = {}
    for (var key of dependencyKeys) {
      if (!pkg[key]) continue
      if (key === 'devDependencies' && !dev) continue
      ipfsDeps[key] = {}
      for (var depName in pkg[key]) {
        var depOpts = { depth: depth + 1, production: opts.production, dev: opts.dev }
        var dep = yield ipfsify(depName, pkg[key][depName], depOpts, w)
        ipfsDeps[key][depName] = dep.ipfsPath
        console.log('%s@%s: %s', depName, dep.pkg.version, dep.ipfsPath)
      }
    }

    // install links in node_modules/ directory
    if (Object.keys(ipfsDeps).length) {
      var nodeModulesPath = path.join(modulePath, 'node_modules')
      yield mkdirp(nodeModulesPath, w)
      for (var key in ipfsDeps) {
        for (var depName in ipfsDeps[key]) {
          var ipfsPath = ipfsDeps[key][depName]
          var depPath = path.join(nodeModulesPath, depName)
          // TODO: maybe we should preserve existing node_modules files, and let the
          // user remove if they want to replace with an inpm symlink
          yield rm(depPath, w)
          yield fs.symlink(ipfsPath, depPath, w)
        }
      }
    }

    // TODO: run install, postinstall scripts. see preinstall comment above

    // save IPFS paths in package.json
    if (!opts.preserve) {
      pkg.ipfs = ipfsDeps
      yield utils.savePackage(modulePath, pkg, w)
    }
  })

  return {
    ipfsify,
    install
  }
}
