# -------------------------------------------------------------------------------
# Imports

{findFreq} = require './freq'
riffwave   = require "./riffwave"
jDataView  = require '../js/jdataview'
fs         = require 'fs'

# -------------------------------------------------------------------------------
# Helper functions

logDebug = (args...) ->
  console.log.apply(console, args)

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

parseBool = (v) ->
  switch String(v)
    when "true" then true
    when "yes" then true
    when "on" then true
    when "1" then true
    else false

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
        srcoctave: 4
        srcnote: 'a'
        octave: 4
        note: 'a'
        wave: 'sine'
        bpm: 120
        duration: 200
        beats: 4
        volume: 1.0
        clip: true
        reverb:
          delay: 0
          decay: 0
        adsr: # no-op ADSR (full 1.0 sustain)
          a: 0
          d: 0
          s: 1
          r: 1

    # if a key is present in this map, that name is considered an "object"
    @objectKeys =
      tone:
        wave: 'string'
        freq: 'float'
        duration: 'float'
        adsr: 'adsr'
        octave: 'int'
        note: 'string'
        volume: 'float'
        clip: 'bool'
        reverb: 'reverb'

      sample:
        src: 'string'
        volume: 'float'
        clip: 'bool'
        reverb: 'reverb'
        srcoctave: 'int'
        srcnote: 'string'
        octave: 'int'
        note: 'string'

      loop:
        bpm: 'int'
        beats: 'int'

      track: {}

    @stateStack = []
    @reset 'default', 0
    @objects = {}
    @object = null
    @objectScopeReady = false

  isObjectType: (type) ->
    return @objectKeys[type]?

  error: (text) ->
    @log.error "PARSE ERROR, line #{@lineNo}: #{text}"

  reset: (name, indent) ->
    name ?= 'default'
    indent ?= 0
    if not @namedStates[name]
      @error "invalid reset name: #{name}"
      return false
    newState = clone(@namedStates[name])
    newState._indent = indent
    @stateStack.push newState
    return true

  flatten: () ->
    flattenedState = {}
    for state in @stateStack
      for key of state
        flattenedState[key] = state[key]
    return flattenedState

  trace: (prefix) ->
    prefix ?= ''
    @log.verbose "trace: #{prefix} " + JSON.stringify(@flatten())

  createObject: (indent, data...) ->
      @object = { _indent: indent }
      for i in [0...data.length] by 2
        @object[data[i]] = data[i+1]
      @objectScopeReady = true

      if @object._type == 'loop'
        @object._patterns = []

      if @object._type == 'track'
        @object._patterns = []

      if @object._name
        @lastObject = @object._name
        logDebug "createObject[#{indent}]: ", @lastObject

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
            when 'bool' then parseBool(v)
            else v

      logDebug "finishObject: ", @object
      @objects[@object._name] = @object
    @object = null

  creatingObjectType: (type) ->
    return false if not @object
    return false if not @object._type == type
    return true

  updateFakeIndents: (indent) ->
    return if indent >= 1000
    i = @stateStack.length - 1
    while i > 0
      prevIndent = @stateStack[i - 1]._indent
      if (@stateStack[i]._indent > 1000) and (prevIndent < indent)
        logDebug "updateFakeIndents: changing stack indent #{i} from #{@stateStack[i]._indent} to #{indent}"
        @stateStack[i]._indent = indent
      i--

  pushState: (indent) ->
    indent ?= 0
    logDebug "pushState(#{indent})"
    @updateFakeIndents indent
    @stateStack.push { _indent: indent }
    return true

  popState: (indent) ->
    logDebug "popState(#{indent})"
    if @object?
      if indent <= @object._indent
        @finishObject()

    @updateFakeIndents indent

    loop
      topIndent = @getTopIndent()
      logDebug "popState(#{indent}) top indent #{topIndent}"
      break if indent == topIndent
      if @stateStack.length < 2
        return false
      logDebug "popState(#{indent}) popping indent #{topIndent}"
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
      pattern: pattern
      length: pattern.length
      sounds: sounds
    }

  getTopIndent: ->
    return @stateStack[@stateStack.length - 1]._indent

  processTokens: (tokens, indent) ->
    cmd = tokens[0].toLowerCase()
    if cmd == 'reset'
      if not @reset(tokens[1], indent)
        return false
    else if cmd == 'section'
      @objectScopeReady = true
    else if @isObjectType(cmd)
      @createObject indent, '_type', cmd, '_name', tokens[1]
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
    else if cmd == 'reverb'
      @stateStack[@stateStack.length - 1][cmd] =
        delay: parseInt(tokens[1])
        decay: parseFloat(tokens[2])
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
      line = @commentRegex.exec(line)[1]       # strip comments and trailing whitespace
      continue if @onlyWhitespaceRegex.test(line)
      [_, indentText, line] = @indentRegex.exec line
      indent = countIndent indentText
      lineObjs = []

      arrowSections = line.split(/\s*->\s*/)
      for arrowSection in arrowSections
        semiSections = arrowSection.split(/\s*;\s*/)
        for semiSection in semiSections
          lineObjs.push {
              indent: indent
              line: semiSection
            }
        indent += 1000

      for obj in lineObjs
        logDebug "handling indent: " + JSON.stringify(obj)
        topIndent = @getTopIndent()
        if obj.indent > topIndent
          @pushState(obj.indent)
        else
          if not @popState(obj.indent)
            @log.error "unexpected outdent"
            return false

        logDebug "processing: " + JSON.stringify(obj)
        if not @processTokens(obj.line.split(/\s+/), obj.indent)
          return false

    @popState(0)
    return true

# -------------------------------------------------------------------------------
# Renderer

# In all cases where a rendered sound is generated, there are actually two lengths
# associated with the sound. "sound.length" is the "expected" length, with regards
# to the typed-in duration for it or for determining loop offets. The other length
# is the sound.samples.length (also known as the "overflow length"), which is the
# length that accounts for things like reverb or anything else that would cause the
# sound to spill into the next loop/track. This allows for seamless loops that can
# play a long sound as the end of a pattern, and it'll cleanly mix into the beginning
# of the next pattern.

class Renderer
  constructor: (@log, @sampleRate, @readLocalFiles, @objects) ->
    @soundCache = {}

  error: (text) ->
    @log.error "RENDER ERROR: #{text}"

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
    amplitude = 10000
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

    return {
      samples: samples
      length: samples.length
    }

  renderSample: (sampleObj, overrides) ->
    view = null

    if @readLocalFiles
      data = fs.readFileSync sampleObj.src
      view = new jDataView(data, 0, data.length, true)
    else
      $.ajax {
        url: sampleObj.src
        mimeType: 'text/plain; charset=x-user-defined'
        success: (data) ->
          view = new jDataView(data, 0, data.length, true)
        async: false
      }

    if not view
      return {
        samples: []
        length: 0
      }

    # skip the first 40 bytes
    view.seek(40)
    subchunk2Size = view.getInt32()
    samples = []
    while view.tell()+1 < view.byteLength
      samples.push view.getInt16()

    overrideNote = if overrides.note then overrides.note else sampleObj.note
    if (overrideNote != sampleObj.srcnote) or (sampleObj.octave != sampleObj.srcoctave)
      oldfreq = findFreq(sampleObj.srcoctave, sampleObj.srcnote)
      newfreq = findFreq(sampleObj.octave, overrideNote)

      factor = oldfreq / newfreq
      # @log.verbose "old: #{oldfreq}, new: #{newfreq}, factor: #{factor}"

      # TODO: Properly resample here with something other than "nearest neighbor"
      relength = Math.floor(samples.length * factor)
      resamples = Array(relength)
      for i in [0...relength]
        resamples[i] = 0
      for i in [0...relength]
        resamples[i] = samples[Math.floor(i / factor)]

      return {
        samples: resamples
        length: resamples.length
      }
    else
      return {
        samples: samples
        length: samples.length
      }

  renderLoop: (loopObj) ->
    beatCount = 0
    for pattern in loopObj._patterns
      if beatCount < pattern.length
        beatCount = pattern.length

    samplesPerBeat = @sampleRate / (loopObj.bpm / 60) / loopObj.beats
    totalLength = samplesPerBeat * beatCount
    overflowLength = totalLength

    for pattern in loopObj._patterns
      sectionCount = pattern.length / 16
      offsetLength = Math.floor(totalLength / 16 / sectionCount)
      for sound in pattern.sounds
        overrides = {}
        if sound.length > 0
          overrides.length = sound.length * offsetLength
        if sound.note?
          overrides.note = sound.note
        sound._render = @render(pattern.src, overrides)
        end = (sound.offset * offsetLength) + sound._render.samples.length
        if overflowLength < end
          overflowLength = end

    samples = Array(overflowLength)
    for i in [0...overflowLength]
      samples[i] = 0

    for pattern in loopObj._patterns
      sectionCount = pattern.length / 16
      offsetLength = Math.floor(totalLength / 16 / sectionCount)

      patternSamples = Array(overflowLength)
      for i in [0...overflowLength]
        patternSamples[i] = 0

      for sound in pattern.sounds
        srcSound = sound._render

        obj = @getObject(pattern.src)
        offset = sound.offset * offsetLength
        copyLen = srcSound.samples.length
        if (offset + copyLen) > overflowLength
          copyLen = overflowLength - offset

        if obj.clip
          fadeClip = 200 # fade out over this many samples prior to a clip to avoid a pop
          if offset > fadeClip
            for j in [0...fadeClip]
              v = patternSamples[offset - fadeClip + j]
              patternSamples[offset - fadeClip + j] = Math.floor(v * ((fadeClip - j) / fadeClip))
          for j in [offset...overflowLength]
            # clean out the rest of the sound to ensure that the previous one (which could be longer) was fully clipped
            patternSamples[j] = 0
          for j in [0...copyLen]
            patternSamples[offset + j] = srcSound.samples[j]
        else
          for j in [0...copyLen]
            patternSamples[offset + j] += srcSound.samples[j]

      # Now copy the clipped pattern into the final loop
      for j in [0...overflowLength]
        samples[j] += patternSamples[j]

    return {
      samples: samples
      length: totalLength
    }

  renderTrack: (trackObj) ->
    pieceCount = 0
    for pattern in trackObj._patterns
      if pieceCount < pattern.pattern.length
        pieceCount = pattern.pattern.length

    totalLength = 0
    overflowLength = 0
    pieceTotalLength = Array(pieceCount)
    pieceOverflowLength = Array(pieceCount)
    for pieceIndex in [0...pieceCount]
      pieceTotalLength[pieceIndex] = 0
      pieceOverflowLength[pieceIndex] = 0
      for pattern in trackObj._patterns
        if (pieceIndex < pattern.pattern.length) and (pattern.pattern[pieceIndex] != '.')
          srcSound = @render(pattern.src)
          if pieceTotalLength[pieceIndex] < srcSound.length
            pieceTotalLength[pieceIndex] = srcSound.length
          if pieceOverflowLength[pieceIndex] < srcSound.samples.length
            pieceOverflowLength[pieceIndex] = srcSound.samples.length
      possibleMaxLength = totalLength + pieceOverflowLength[pieceIndex]
      if overflowLength < possibleMaxLength
        overflowLength = possibleMaxLength
      totalLength += pieceTotalLength[pieceIndex]

    samples = Array(overflowLength)
    for i in [0...overflowLength]
      samples[i] = 0

    for pattern in trackObj._patterns
      trackOffset = 0
      srcSound = @render(pattern.src, {})
      for pieceIndex in [0...pieceCount]
        if (pieceIndex < pattern.pattern.length) and (pattern.pattern[pieceIndex] != '.')
          copyLen = srcSound.samples.length
          if (trackOffset + copyLen) > overflowLength
            copyLen = overflowLength - trackOffset
          for j in [0...copyLen]
            samples[trackOffset + j] += srcSound.samples[j]

        trackOffset += pieceTotalLength[pieceIndex]

    return {
      samples: samples
      length: totalLength
    }

  calcCacheName: (type, which, overrides) ->
    if (type != 'tone') and (type != 'sample')
      return which

    name = which
    if overrides.note
      name += "/N#{overrides.note}"
    if overrides.length
      name += "/L#{overrides.length}"

    return name

  getObject: (which) ->
    object = @objects[which]
    if not object
      @error "no such object #{which}"
      return null
    return object

  render: (which, overrides) ->
    object = @getObject(which)
    if not object
      return null

    cacheName = @calcCacheName(object._type, which, overrides)
    if @soundCache[cacheName]
      return @soundCache[cacheName]

    sound = switch object._type
      when 'tone' then @renderTone(object, overrides)
      when 'sample' then @renderSample(object, overrides)
      when 'loop' then @renderLoop(object)
      when 'track' then @renderTrack(object)
      else
        @error "unknown type #{object._type}"
        null

    # Volume
    if object.volume? and (object.volume != 1.0)
      for i in [0...sound.samples.length]
        sound.samples[i] *= object.volume

    # Reverb
    if object.reverb? and (object.reverb.delay > 0)
      delaySamples = Math.floor(object.reverb.delay * @sampleRate / 1000)
      if sound.samples.length > delaySamples
        totalLength = sound.samples.length + (delaySamples * 8) # this *8 is totally wrong. Needs more thought.
        # @log.verbose "reverbing #{cacheName}: #{delaySamples}. length update #{sound.samples.length} -> #{totalLength}"
        samples = Array(totalLength)
        for i in [0...sound.samples.length]
          samples[i] = sound.samples[i]
        for i in [sound.samples.length...totalLength]
          samples[i] = 0
        for i in [0...(totalLength - delaySamples)]
          samples[i + delaySamples] += Math.floor(samples[i] * object.reverb.decay)
        sound.samples = samples

    @log.verbose "Rendered #{cacheName}."
    @soundCache[cacheName] = sound
    return sound

# -------------------------------------------------------------------------------
# Exports

renderLoopScript = (args) ->
  logObj = args.log
  logObj.verbose "Parsing..."
  parser = new Parser(logObj)
  parser.parse args.script

  which = args.which
  which ?= parser.lastObject

  if which
    sampleRate = 44100
    logObj.verbose "Rendering..."
    renderer = new Renderer(logObj, sampleRate, args.readLocalFiles, parser.objects)
    outputSound = renderer.render(which, {})
    if args.outputFilename
      return riffwave.writeWAV args.outputFilename, sampleRate, outputSound.samples
    return riffwave.makeBlobUrl(sampleRate, outputSound.samples)

  return null

module.exports =
  render: renderLoopScript
