var IpfsApi = require('ipfs-api')
var ipfsd = require('ipfsd-ctl')
var mkdirp = require('mkdirp')
var path = require('path')
var tar = require('tar-fs')
var W = require('watt').wrap
var utils = require('./utils.js')

module.exports = function (inpmPath) {
  var ipfsPath = path.join(inpmPath, 'ipfs')

  var ipfsApi
  var getApi = W(function * (w) {
    if (ipfsApi) return ipfsApi
    try {
      ipfsApi = IpfsApi('localhost', 5001)
      yield ipfsApi.id(w)
    } catch (e) {
      yield mkdirp(inpmPath, w)
      var node = yield ipfsd.local(ipfsPath, w)
      if (!(yield utils.exists(ipfsPath, w))) {
        yield node.init(w)
      }
      ipfsApi = yield node.startDaemon(w)
    }
    return ipfsApi
  })

  var get = W(function * (ipfsPath, dest, w) {
    var ipfs = yield getApi(w)
    var read = yield ipfs.send('get', [ ipfsPath ], null, false, w)
    var write = tar.extract(dest, { dmode: 0555, fmode: 0444, map: utils.tarStrip(1) })
    read.pipe(write)
    yield write.on('finish', w)
  })

  return {
    getApi,
    get: get
  }
}
