# fs = require "fs"
{makeBlobUrl} = require "riffwave"

clone = (obj) ->
  if not obj? or typeof obj isnt 'object'
    return obj

  if obj instanceof Date
    return new Date(obj.getTime())

  if obj instanceof RegExp
    flags = ''
    flags += 'g' if obj.global?
    flags += 'i' if obj.ignoreCase?
    flags += 'm' if obj.multiline?
    flags += 'y' if obj.sticky?
    return new RegExp(obj.source, flags)

  newInstance = new obj.constructor()

  for key of obj
    newInstance[key] = clone obj[key]

  return newInstance

class IndentStack
  constructor: ->
    @stack = [0]

  push: (indent) ->
    @stack.push indent

  pop: ->
    if @stack.length > 1
      @stack.pop()
      return true
    return false

  top: ->
    return @stack[@stack.length - 1]

countIndent = (text) ->
  indent = 0
  for i in [0...text.length]
    if text[i] == '\t'
      indent += 8
    else
      indent++
  return indent

class Parser
  constructor: (@log) ->
    @commentRegex = /^([^#]*?)(\s*#.*)?$/
    @onlyWhitespaceRegex = /^\s*$/
    @indentRegex = /^(\s*)(\S.*)$/
    @leadingUnderscoreRegex = /^_/

    @namedStates =
      default:
        wave: 'sine'
        freq: 440
        bpm: 120
        duration: 200
        beats: 4
        adsr: [0, 0, 1, 1]

    @objectKeys =
      tone:
        wave: 'string'
        freq: 'float'
        duration: 'float'
        adsr: 'adsr'

      loop:
        bpm: 'int'
        beats: 'int'

      track: {}

    @indentStack = new IndentStack
    @stateStack = []
    @reset 'default'
    @objects = {}
    @object = null
    @objectScopeReady = false

  isObjectType: (type) ->
    return @objectKeys[type]?

  error: (text) ->
    @log "PARSE ERROR, line #{@lineNo}: #{text}"

  reset: (name) ->
    name ?= 'default'
    if not @namedStates[name]
      @error "invalid reset name: #{name}"
      return false
    @stateStack.push clone(@namedStates[name])
    return true

  flatten: () ->
    flattenedState = {}
    for state in @stateStack
      for key of state
        flattenedState[key] = state[key]
    return flattenedState

  trace: (prefix) ->
    prefix ?= ''
    @log "trace: #{prefix} " + JSON.stringify(@flatten())

  createObject: (data...) ->
      @finishObject()

      @object = {}
      for i in [0...data.length] by 2
        @object[data[i]] = data[i+1]
      @objectScopeReady = true

      if @object._type == 'loop'
        @object._patterns = []

      if @object._type == 'track'
        @object._patterns = []

      if @object._name
        @lastObject = @object._name

  finishObject: ->
    if @object
      state = @flatten()
      for key of @objectKeys[@object._type]
        expectedType = @objectKeys[@object._type][key]
        v = state[key]
        @object[key] = switch expectedType
          when 'int' then parseInt(v)
          when 'float' then parseFloat(v)
          else v
      @objects[@object._name] = @object
    @object = null

  creatingObjectType: (type) ->
    return false if not @object
    return false if not @object._type == type
    return true

  pushScope: ->
    if not @objectScopeReady
      @error "unexpected indent"
      return false
    @objectScopeReady = false
    @stateStack.push { _scope: true }
    return true

  popScope: ->
    @finishObject()
    loop
      if @stateStack.length == 0
        @error "state stack is empty! something bad has happened"
      top = @stateStack[@stateStack.length - 1]
      break if top._scope?
      @stateStack.pop()
    @stateStack.pop()
    return true

  processTokens: (tokens) ->
    cmd = tokens[0].toLowerCase()
    if cmd == 'reset'
      if not @reset(tokens[1])
        return false
    else if @isObjectType(cmd)
      @createObject '_type', cmd, '_name', tokens[1]
    else if cmd == 'pattern'
      if not (@creatingObjectType('loop') or @creatingObjectType('track'))
        @error "unexpected pattern command"
        return false
      @object._patterns.push {
        src: tokens[1]
        pattern: tokens[2]
      }
    else if cmd == 'adsr'
      @stateStack[@stateStack.length - 1][cmd] =
        a: parseFloat(tokens[1])
        d: parseFloat(tokens[2])
        s: parseFloat(tokens[3])
        r: parseFloat(tokens[4])
    else
      # The boring regular case: stash off this value
      if @leadingUnderscoreRegex.test(cmd)
        @error "cannot set internal names (underscore prefix)"
        return false
      @stateStack[@stateStack.length - 1][cmd] = tokens[1]

    return true

  parse: (text) ->
    lines = text.split('\n')
    @lineNo = 0
    for line in lines
      @lineNo++
      line = line.replace(/(\r\n|\n|\r)/gm,"") # strip newlines
      line = @commentRegex.exec(line)[1]        # strip comments and trailing whitespace
      continue if @onlyWhitespaceRegex.test(line)
      [_, indentText, line] = @indentRegex.exec line
      indent = countIndent indentText

      topIndent = @indentStack.top()
      if indent == topIndent
        # do nothing
      else if indent > topIndent
        @indentStack.push indent
        if not @pushScope()
          return false
      else
        loop
          if not @indentStack.pop()
            @log "Unexpected indent #{indent} on line #{lineNo}: #{line}"
            return false
          if not @popScope()
            return false
          break if @indentStack.top() == indent

      if not @processTokens(line.split(/\s+/))
        return false

    while @indentStack.pop()
      @popScope()

    @finishObject()
    return true

class Renderer
  constructor: (@log, @sampleRate, @objects) ->

  error: (text) ->
    @log "RENDER ERROR: #{text}"

  generateEnvelope: (adsr, length) ->
    envelope = Array(length)
    AtoD = Math.floor(adsr.a * length)
    DtoS = Math.floor(adsr.d * length)
    StoR = Math.floor(adsr.r * length)
    attackLen = AtoD
    decayLen = DtoS - AtoD
    sustainLen = StoR - DtoS
    releaseLen = length - StoR
    sustain = adsr.s
    peakSustainDelta = 1.0 - sustain
    for i in [0...attackLen]
      # Attack
      envelope[i] = i / attackLen
    for i in [0...decayLen]
      # Decay
      envelope[AtoD + i] = 1.0 - (peakSustainDelta * (i / decayLen))
    for i in [0...sustainLen]
      # Sustain
      envelope[DtoS + i] = sustain
    for i in [0...releaseLen]
      # Release
      envelope[StoR + i] = sustain - (sustain * (i / releaseLen))
    return envelope

  renderTone: (toneObj) ->
    offset = 0
    amplitude = 16000
    length = Math.floor(toneObj.duration * @sampleRate / 1000)
    samples = Array(length)
    A = 200
    B = 0.5
    freq = toneObj.freq
    envelope = @generateEnvelope(toneObj.adsr, length)
    for i in [0...length]
      period = @sampleRate / freq
      sine = Math.sin(offset + i / period * 2 * Math.PI)
      # if(toneObj.wav == "square")
      #   sine = (sine > 0) ? 1 : -1
      samples[i] = sine * amplitude * envelope[i]
    return samples

  renderPatterns: (patterns, totalLength, calcSliceLength) ->
    samples = Array(totalLength)
    for i in [0...totalLength]
      samples[i] = 0

    for pattern in patterns
      srcSamples = @render(pattern.src)
      if calcSliceLength
        sliceLength = Math.floor(totalLength / pattern.pattern.length)
      else
        sliceLength = srcSamples.length

      for i in [0...pattern.pattern.length]
        slice = pattern.pattern[i]
        if slice != '.'
          offset = i * sliceLength
          copyLen = srcSamples.length
          if (offset + copyLen) > totalLength
            copyLen = totalLength - offset
          for j in [0...copyLen]
            samples[offset + j] += srcSamples[j]

    return samples

  renderLoop: (loopObj) ->
    beatCount = 0
    for pattern in loopObj._patterns
      if beatCount < pattern.pattern.length
        beatCount = pattern.pattern.length

    samplesPerBeat = @sampleRate / (loopObj.bpm / 60) / loopObj.beats
    loopLength = samplesPerBeat * beatCount

    return @renderPatterns(loopObj._patterns, loopLength, true)

  renderTrack: (trackObj) ->
    trackLength = 0
    for pattern in trackObj._patterns
      srcSamples = @render(pattern.src)
      patternLength = srcSamples.length * pattern.pattern.length
      if trackLength < patternLength
        trackLength = patternLength

    return @renderPatterns(trackObj._patterns, trackLength, false)

  render: (which) ->
    object = @objects[which]
    if not object
      @error "no such object #{which}"
      return null

    if object._samples
      return object._samples

    samples = switch object._type
      when 'tone' then @renderTone(object)
      when 'loop' then @renderLoop(object)
      when 'track' then @renderTrack(object)
      else
        @error "unknown type #{object._type}"
        null

    @log "Rendered #{which}."
    object._samples = samples
    return samples

renderLoopScript = (loopscript, logCB) ->
  logCB "Parsing..."
  parser = new Parser(logCB)
  parser.parse loopscript

  if parser.lastObject
    sampleRate = 44100
    logCB "Rendering..."
    renderer = new Renderer(logCB, sampleRate, parser.objects)
    outputSamples = renderer.render(parser.lastObject)
    return makeBlobUrl(sampleRate, outputSamples)

  return null

module.exports =
  render: renderLoopScript
