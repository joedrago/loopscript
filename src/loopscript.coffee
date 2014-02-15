# -------------------------------------------------------------------------------
# Imports

{makeBlobUrl} = require "riffwave"
{findFreq}    = require 'freq'

# -------------------------------------------------------------------------------
# Helper functions

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

# -------------------------------------------------------------------------------
# IndentStack - used by Parser

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

# -------------------------------------------------------------------------------
# Parser

class Parser
  constructor: (@log) ->
    @commentRegex = /^([^#]*?)(\s*#.*)?$/
    @onlyWhitespaceRegex = /^\s*$/
    @indentRegex = /^(\s*)(\S.*)$/
    @leadingUnderscoreRegex = /^_/
    @hasCapitalLettersRegex = /[A-Z]/
    @isNoteRegex = /[A-La-l]/

    # H-L are the black keys:
    #  H I   J K L
    # C D E F G A B

    @namedStates =
      default:
        wave: 'sine'
        bpm: 120
        duration: 200
        beats: 4
        octave: 4
        note: 'a'
        adsr: [0, 0, 1, 1] # no-op ADSR (full 1.0 sustain)

    # if a key is present in this map, that name is considered an "object"
    @objectKeys =
      tone:
        wave: 'string'
        freq: 'float'
        duration: 'float'
        adsr: 'adsr'
        octave: 'int'
        note: 'string'

      sample:
        src: 'string'

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
        if state[key]?
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

  parsePattern: (pattern) ->
    overrideLength = @hasCapitalLettersRegex.test(pattern)
    i = 0
    sounds = []
    while i < pattern.length
      c = pattern[i]
      if c != '.'
        symbol = c.toLowerCase()
        sound = { offset: i }
        if @isNoteRegex.test(c)
          sound.note = symbol
        if overrideLength
          length = 1
          loop
            next = pattern[i+1]
            if next == symbol
              length++
              i++
              if i == pattern.length
                break
            else
              break
          sound.length = length
        sounds.push sound
      i++
    return {
      length: pattern.length
      sounds: sounds
    }

  processTokens: (tokens) ->
    cmd = tokens[0].toLowerCase()
    if cmd == 'reset'
      if not @reset(tokens[1])
        return false
    else if cmd == 'section'
      @objectScopeReady = true
    else if @isObjectType(cmd)
      @createObject '_type', cmd, '_name', tokens[1]
    else if cmd == 'pattern'
      if not (@creatingObjectType('loop') or @creatingObjectType('track'))
        @error "unexpected pattern command"
        return false

      pattern = @parsePattern(tokens[2])
      pattern.src = tokens[1]
      @object._patterns.push pattern
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

# -------------------------------------------------------------------------------
# Renderer

class Renderer
  constructor: (@log, @sampleRate, @objects) ->
    @sampleCache = {}

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

  renderTone: (toneObj, overrides) ->
    offset = 0
    amplitude = 16000
    if overrides.length > 0
      length = overrides.length
    else
      length = Math.floor(toneObj.duration * @sampleRate / 1000)
    samples = Array(length)
    A = 200
    B = 0.5
    if overrides.note?
      freq = findFreq(toneObj.octave, overrides.note)
    else if toneObj.freq?
      freq = toneObj.freq
    else
      freq = findFreq(toneObj.octave, toneObj.note)
    envelope = @generateEnvelope(toneObj.adsr, length)
    for i in [0...length]
      period = @sampleRate / freq
      sine = Math.sin(offset + i / period * 2 * Math.PI)
      # if(toneObj.wav == "square")
      #   sine = (sine > 0) ? 1 : -1
      samples[i] = sine * amplitude * envelope[i]
    return samples

  renderSample: (sampleObj) ->
    view = null

    $.ajax {
      url: sampleObj.src
      mimeType: 'text/plain; charset=x-user-defined'
      success: (data) ->
        console.log "data length #{data.length}"
        view = new jDataView(data, 0, data.length, true)
      async: false
    }

    if not view
      return []

    console.log "#{sampleObj.src} is #{view.byteLength} in size"

    # skip the first 40 bytes
    view.seek(40)
    subchunk2Size = view.getInt32()
    console.log "subchunk2Size is #{subchunk2Size}"

    samples = []
    while view.tell()+1 < view.byteLength
      samples.push view.getInt16()
    console.log "looped #{samples.length} times"

    return samples

  renderPatterns: (patterns, totalLength, calcOffsetLength) ->
    samples = Array(totalLength)
    for i in [0...totalLength]
      samples[i] = 0

    for pattern in patterns
      for sound in pattern.sounds
        overrides = {}
        offsetLength = Math.floor(totalLength / pattern.length)
        if sound.length > 0
          overrides.length = sound.length * offsetLength
        if sound.note?
          overrides.note = sound.note

        srcSamples = @render(pattern.src, overrides)
        if not calcOffsetLength
          offsetLength = srcSamples.length

        offset = sound.offset * offsetLength
        copyLen = srcSamples.length
        if (offset + copyLen) > totalLength
          copyLen = totalLength - offset
        for j in [0...copyLen]
          samples[offset + j] += srcSamples[j]

    return samples

  renderLoop: (loopObj) ->
    beatCount = 0
    for pattern in loopObj._patterns
      if beatCount < pattern.length
        beatCount = pattern.length

    samplesPerBeat = @sampleRate / (loopObj.bpm / 60) / loopObj.beats
    loopLength = samplesPerBeat * beatCount

    return @renderPatterns(loopObj._patterns, loopLength, true)

  renderTrack: (trackObj) ->
    trackLength = 0
    for pattern in trackObj._patterns
      srcSamples = @render(pattern.src)
      patternLength = srcSamples.length * pattern.length
      if trackLength < patternLength
        trackLength = patternLength

    return @renderPatterns(trackObj._patterns, trackLength, false)

  calcCacheName: (type, which, overrides) ->
    if type != 'tone'
      return which

    name = which
    if overrides.note
      name += "/N#{overrides.note}"
    if overrides.length
      name += "/L#{overrides.length}"

    return name

  render: (which, overrides) ->
    object = @objects[which]
    if not object
      @error "no such object #{which}"
      return null

    cacheName = @calcCacheName(object._type, which, overrides)
    if @sampleCache[cacheName]
      return @sampleCache[cacheName]

    samples = switch object._type
      when 'tone' then @renderTone(object, overrides)
      when 'loop' then @renderLoop(object)
      when 'track' then @renderTrack(object)
      when 'sample' then @renderSample(object)
      else
        @error "unknown type #{object._type}"
        null

    @log "Rendered #{cacheName}."
    @sampleCache[cacheName] = samples
    return samples

# -------------------------------------------------------------------------------
# Exports

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
