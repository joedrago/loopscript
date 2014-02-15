# -------------------------------------------------------------------------------
# Modules

# Assumed to be in src/XXXXX.coffee, @is also the require() string
modules = [
  'loopscript'
  'riffwave'
  'freq'
  'examples'
]

# -------------------------------------------------------------------------------
# List of things that might need to be require()'d, but aren't in our sources

externals = [
]

# -------------------------------------------------------------------------------
# Build scripts

browserify = require 'browserify'
fs         = require 'fs'
util       = require 'util'
watch      = require 'node-watch'
http       = require 'http'

generateJSBundle = (cb) ->
  name = "loopscript"
  outputDir = "js/"
  b = browserify {
    basedir: outputDir
    extensions: ['coffee']
  }
  b.transform 'coffeeify'
  for module in modules
    b.require('../src/' + module + '.coffee', { expose: module })
  for ext in externals
    b.external ext
  outputFilename = "#{outputDir}#{name}.js"
  bundlePipe = b.bundle({ debug: true })
    .on 'error', (err) ->
      util.log "Error #{err}"
    bundlePipe
      .pipe(require('mold-source-map').transformSourcesRelativeTo(outputDir))
      .pipe(fs.createWriteStream(outputFilename))
      .on 'finish', ->
        util.log "Generated #{outputFilename}"
        cb() if cb?

buildEverything = (cb) ->
  generateJSBundle ->
    util.log "Build complete."
    cb() if cb

task 'build', 'build html', (options) ->
  buildEverything()

option '-p', '--port [PORT]', 'Dev server port'

task 'server', 'Run server and watch for changed source files to automatically rebuild', (options) ->
  buildEverything ->
    util.log "Watching for changes in src"

    options.port ?= 9000
    util.log "Starting server at http://localhost:#{options.port}/"

    nodeStatic = require 'node-static'
    file = new nodeStatic.Server '.'
    httpServer = http.createServer (request, response) ->
      request.addListener 'end', ->
        file.serve(request, response);
      .resume()
    httpServer.listen options.port

    watch 'src', (filename) ->
      util.log "Source code #{filename} changed, regenerating bundle..."
      generateJSBundle()
