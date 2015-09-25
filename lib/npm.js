var fs = require('fs')
var mkdirp = require('mkdirp')
var request = require('request')
var semver = require('semver')
var tar = require('tar')
var path = require('path')
var utils = require('./utils.js')
var W = require('watt').wrap
var zlib = require('zlib')

var REGISTRY_URI = 'https://registry.npmjs.org/'

// fetches a module from npm and saves to the filesystem
var fetch = W(function * (package, version, dest, w) {
  dest = path.resolve(dest)

  var info = yield request(REGISTRY_URI + package, w)
  info = JSON.parse(info.body)
  var versions = Object.keys(info.versions)
  var best = bestVersionMatch(version, versions)
  if (!best) {
    throw new Error('No versions of "' + package + '" match version "' + version + '"')
  }

  var tarballPath = REGISTRY_URI + package + '/-/' + package + '-' + best + '.tgz'
  var read = request(tarballPath)
  var gunzip = zlib.createGunzip()
  var write = tar.Extract({ path: dest, strip: 1 })
  read.pipe(gunzip).pipe(write)
  yield write.once('finish', w.args)
})

function bestVersionMatch (version, versions) {
  versions = versions.sort(semver.compareLoose).reverse()
  for (var v of versions) {
    if (semver.satisfies(v, version) || !version) return v
  }
}

module.exports = {
  fetch,
  bestVersionMatch
}
