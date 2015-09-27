var request = require('request')
var semver = require('semver')
var tar = require('tar')
var path = require('path')
var W = require('watt').wrap
var zlib = require('zlib')

var REGISTRY_URI = 'https://registry.npmjs.org/'

// fetches a package from npm and saves to the filesystem
var fetch = W(function * (name, range, dest, w) {
  dest = path.resolve(dest)
  var version = range
  // skip checking registry for latest version if our version range is an exact version
  if (semver.clean(range) !== range) {
    version = yield latestVersion(name, range, w)
  }
  var tarballPath = REGISTRY_URI + name + '/-/' + name + '-' + version + '.tgz'
  var read = request(tarballPath)
  var gunzip = zlib.createGunzip()
  var write = tar.Extract({ path: dest, strip: 1 })
  read.pipe(gunzip).pipe(write)
  yield write.once('finish', w.args)
})

// gets the latest available version number that matches `range`
var latestVersion = W(function * (name, range, w) {
  var pkgInfo = yield info(name, w)
  var versions = Object.keys(pkgInfo.versions)
  var latest = semver.maxSatisfying(versions, range)
  if (!latest) {
    throw new Error('No versions of "' + name + '" match version "' + range + '"')
  }
  return latest
})

// gets info about a package from the registry
var info = W(function * (name, w) {
  var res = yield request(REGISTRY_URI + name, w)
  return JSON.parse(res.body)
})

module.exports = {
  fetch,
  latestVersion,
  info
}
