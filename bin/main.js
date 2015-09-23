#!/usr/bin/env node --harmony

var args = require('minimist')(process.argv)
var subcom = require('subcomandante')
var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var concat = require('concat-stream')
var tar = require('tar')
var run = require('watt')
var ipfsApi = require('ipfs-api')
var ipfsd = require('ipfsd-ctl')

var INPM_PATH = path.join(process.env.HOME, '.inpm')
var REGISTRY_PATH = path.join(INPM_PATH, 'node_modules')
var IPFS_PATH = path.join(INPM_PATH, 'ipfs')

function readPackage (packagePath) {
  var raw = fs.readFileSync(packagePath).toString()
  return JSON.parse(raw)
}

function savePackage (packagePath, data) {
  var raw = JSON.stringify(data, null, '  ')
  fs.writeFileSync(packagePath, raw)
}

var ipfs
function getIpfsApi (cb) {
  run(function * (W) {
    if (ipfs) return ipfs
    try {
      ipfs = ipfsApi('localhost', 5001)
      yield ipfs.id(W)
    } catch (e) {
      yield mkdirp(INPM_PATH, W)
      var node = yield ipfsd.local(IPFS_PATH, W)
      if (!(yield fs.exists(IPFS_PATH, W.arg(0)))) {
        yield node.init(W)
      }
      ipfs = yield node.startDaemon(W)
    }
    return ipfs
  }, cb)
}

// adds a module to IPFS and copies it to the local registry
function addToRegistry (modulePath, cb) {
  run(function * (W) {
    var pkg = yield fs.readFile(path.join(modulePath, 'package.json'), W)
    pkg = JSON.parse(pkg.toString())
    var regPath = path.join(REGISTRY_PATH, pkg.name, pkg.version)
    if (yield fs.exists(regPath, W.args(0))) {
      throw new Error(pkg.name + '@' + pkg.version + ' already exists in the registry')
    }
    yield mkdirp(path.dirname(regPath), W)

    var ipfs = yield getIpfsApi(W)
    var add = yield ipfs.add(modulePath, { r: true }, W)
    var root = add[add.length - 1].Hash

    var read = yield ipfs.send('get', [ root ], null, false, W)
    var write = tar.Extract({ path: regPath, strip: 1 })
    read.pipe(write)
    yield write.on('finish', W)

    return root
  }, cb)
}

// fetches a module from npm and saves to a temporary directory
function fetchFromNpm (id, cb) {
  run(function * (W) {
    var tempDir = path.join(process.env.TMPDIR, randomString())
    yield mkdirp(tempDir, W)

    var cmd = subcom('npm', [ 'install', id ], { cwd: tempDir })
    var res = yield cmd.once('exit', W.arg(0))
    if (res !== 0) {
      throw yield cmd.once('error', W.arg(0))
    }

    var outputPath = path.join(tempDir, 'node_modules')
    var pkgName = (yield fs.readdir(outputPath, W))[0]
    return path.join(outputPath, pkgName)
  }, cb)
}

function ipfsizeDependencies (modulePath, cb) {
  run(function * (W) {

  }, cb)
}

function randomString () {
  return Math.random().toString(36).slice(3)
}

addToRegistry('/var/folders/1g/z8fjms213sj_tbv00nr5rm7m0000gn/T/zf9u7vmds0885mi/node_modules/async', function (err, res) {
  console.log(err, res)
})
