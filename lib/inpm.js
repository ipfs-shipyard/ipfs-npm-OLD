'use strict'

var fs = require('fs-extra')
var mkdirp = require('mkdirp')
var npm = require('./npm.js')
var path = require('path')
var rm = require('rimraf')
var semver = require('semver')
var utils = require('./utils.js')
var W = require('watt').wrap
require('colors')

module.exports = function (inpmPath) {
  var registry = require('./registry.js')(inpmPath)
  var ipfs = require('./ipfs.js')(inpmPath)

  var dependencyKeys = [ 'dependencies', 'optionalDependencies', 'devDependencies' ]
  var installing = new Map()

  // installs an npm registry package, with IPFS dependencies added to the package.json
  var fetch = W(function * (name, version, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    // check the npm registry for the latest version match
    var latest = yield npm.latestVersion(name, version, w)
    var id = name + '@' + latest

    // check if we already have that version in the local registry
    // TODO: if offline (no npm), use latest version match in local registry (if any)

    if (yield registry.has(name, latest, w)) {
      console.log('getting %s from registry'.green, id.bold)
      return yield registry.get(name, latest, w)
    }

    // check if this package is already being processed
    // if so, wait for the result rather than duplicating the work
    if (installing.has(id)) {
      console.log('getting %s from registry'.green, id.bold)
      return yield installing.get(id).push(w)
    }
    installing.set(id, [])

    var err = null
    try {
      // fetch package (without dependencies) from npm
      var tempPath = utils.getTempDir()
      yield mkdirp(tempPath, w)
      console.log('fetching %s'.magenta, id.bold)
      yield npm.fetch(name, latest, tempPath, w)

      // fetch the dependencies and install, then add this package to local registry
      yield install(tempPath, opts, w)
      var res = yield registry.add(tempPath, w)
      res.tempPath = tempPath

      // TODO: create a DAG node which links to the dependencies, and to the unixfs directory
    } catch (e) {
      err = e
      console.error(e.message.red)
    }

    var listeners = installing.get(id)
    installing.delete(id)
    listeners.forEach(cb => setImmediate(cb, err, res))
    if (err) throw err

    console.log('%s %s: %s', '✓'.green.bold, id.bold, res.ipfsPath.gray)
    return res
  })

  var fetchDependencies = W(function * (modulePath, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    var pkg = opts.pkg || (yield utils.readPackage(modulePath, w))
    // TODO: read npm-shrinkwrap.json

    // get paths of IPFSified dependencies
    var deps = {}
    for (let dep of dependencies(pkg, opts)) {
      w.parallel({ limit: 5 }, function * (w) {
        var depOpts = {
          depth: (opts.depth || 0) + 1,
          production: opts.production,
          dev: opts.dev
        }
        var depPkg = yield fetch(dep.name, dep.value, depOpts, w)
        deps[dep.key] = deps[dep.key] || {}
        deps[dep.key][dep.name] = depPkg
      })
    }
    yield w.sync() // wait for all the parallel fetch tasks to finish
    return deps
  })

  var install = W(function * (modulePath, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    var pkg = opts.pkg = opts.pkg || (yield utils.readPackage(modulePath, w))
    var deps = yield fetchDependencies(modulePath, opts, w)

    // TODO: run preinstall scripts. not sure how to handle this:
    // (if the script modifies files, it shouldn't affect the IPFS root of the package,
    // we should possible duplicate the package locally so the changes live outside of
    // the local registry)

    // install links in node_modules/ directory
    if (Object.keys(deps).length) {
      yield mkdirp(utils.modulesPath(modulePath), w)
    }
    for (let key in deps) {
      for (let depName in deps[key]) {
        var dep = deps[key][depName]
        var depPath = path.join(utils.modulesPath(modulePath), depName)

        // if module exists, delete if --force flag, skip if semver range is satisfied,
        // proceed with install otherwise
        if (yield utils.exists(depPath, w)) {
          if (opts.force) {
            yield rm(depPath, w)
          } else {
            var version = (yield utils.readPackage(depPath, w)).version
            if (semver.satisfies(version, pkg[key][depName])) {
              console.log('%s is already installed, skipping'.yellow, (depName + '@' + version).bold)
              continue
            }
          }
        }

        if (opts.duplicate) {
          if (dep.tempPath) {
            fs.copy(dep.tempPath, depPath, w)
            continue
          }
          console.log('duplicating %s'.cyan, (dep.pkg.name + '@' + dep.pkg.version).bold)
          yield duplicate(dep.ipfsPath, depPath, { pkg: dep.pkg }, w)
        } else {
          yield fs.symlink(dep.ipfsPath, depPath, w)
        }
      }
    }

    // TODO: run install, postinstall scripts. see preinstall comment above

    // save IPFS paths in package.json
    if (!opts.preserve) {
      pkg.ipfs = getIpfsPaths(deps)
      yield utils.savePackage(modulePath, pkg, w)
    }

    return pkg
  })

  var duplicate = W(function * (ipfsPath, destPath, opts, w) {
    if (typeof opts === 'function') {
      w = opts
      opts = {}
    }

    yield ipfs.get(ipfsPath, destPath, w)
    var pkg = opts.pkg = opts.pkg || (yield utils.readPackage(destPath, w))
    var nodeModulesPath = utils.modulesPath(destPath)
    yield rm(nodeModulesPath, w)

    for (let dep of dependencies(pkg.ipfs, opts)) {
      w.parallel({ limit: 5 }, function * (w) {
        var depPath = path.join(nodeModulesPath, dep.name)
        var depOpts = {
          depth: (opts.depth || 0) + 1,
          production: opts.production,
          dev: opts.dev
        }
        yield duplicate(dep.value, depPath, depOpts, w)
      })
    }
    yield w.sync()
  })

  var dependencies = function * (pkg, opts) {
    var dev = opts.dev || !opts.production && !opts.depth
    for (let key of dependencyKeys) {
      if (!pkg[key]) continue
      if (key === 'devDependencies' && !dev) continue
      for (let name in pkg[key]) {
        yield { name, value: pkg[key][name], key: key }
      }
    }
  }

  function getIpfsPaths (deps) {
    var output = {}
    for (var key in deps) {
      output[key] = {}
      for (var name in deps[key]) {
        output[key][name] = deps[key][name].ipfsPath
      }
    }
    return output
  }

  return {
    fetch,
    fetchDependencies,
    install,
    duplicate,
    dependencies
  }
}
