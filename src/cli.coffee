fs = require 'fs'

syntax = ->
  console.log "Syntax: loopscript file.loopscript outputFilename [optional sound name]"
  console.log "\n        Sound name defaults to the last sound defined in the LoopScript."
  process.exit(1)

log = (text) ->
  console.log "LS: #{text}"

main = ->
  args = process.argv.slice(2)
  if args.length < 2 or args.length > 3
    syntax()

  which = null
  inputFilename = args[0]
  outputFilename = args[1]
  if args.length > 2
    which = args[2]

  log "Reading #{inputFilename}"
  script = fs.readFileSync inputFilename, { encoding: 'utf-8' }

  loopscript = require "./loopscript"
  loopscript.render {
    script: script
    log: log
    outputFilename: outputFilename
    which: which
    readLocalFiles: true
  }

  log "Wrote #{outputFilename}"

module.exports =
  main: main
