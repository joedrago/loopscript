module.exports =

  first: """
# ------------------------------------------------------------
# Your first LoopScript. Click "Compile" below to start!

tone note1
  duration 250
  octave 4
  note C

tone bass1
  duration 250
  octave 1
  note B

loop loop1
  pattern note1 x.......x.......
  pattern bass1 ....x.......x...

"""

  notes: """
# ------------------------------------------------------------
# Note overrides!

# H-L are the black keys:
#     H I   J K L
#    C D E F G A B

# Try setting the duration to 100
tone note1
  adsr 0.005 0.05 0.7 0.05
  duration 250

# Samples can have their notes overridden too!
sample ding
  src samples/ding_e.wav
  srcnote e

loop loop1
  pattern note1 b.a.g.a.b.b.b...

loop loop2
  pattern ding b.a.g.a.b.b.b...

track song
  pattern loop1 x
  pattern loop2 .x

"""

  motto: """
# ------------------------------------------------------------
# An approximation of the beat from Drake's "The Motto"

bpm 100
section # to share ADSR
  adsr 0.005 0.05 0.7 0.05
  tone bass1
    octave 1
  tone bass2
    octave 2

sample clap  -> src samples/clap.wav
sample snare -> src samples/snare.wav
sample hihat -> src samples/hihat.wav

loop loop1
  pattern hihat ..x.......x.......x.......x.....
  pattern clap  ....x.......x.......x.......x...
  pattern snare ......x...x...x.x...............
  pattern bass1 Bbbbbb..........................
  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.

track song
  pattern loop1 xxxx

"""

  length: """
# ------------------------------------------------------------
# Showing off various note lengths using caps and lowercase
# Also shows what ADSR can do!

tone note1
  adsr 0.005 0.05 0.7 0.05

tone note2
  # Note: Only the first tone has ADSR

# If you use any letters other than "x" on a tone pattern, you override its
# note with the note listed. Also, if you use any capital letters in a pattern,
# you override the length of that note with the number of matching lowercase
# letters following it.

loop loop1
  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...

loop loop2
  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...

track song
  pattern loop1 x.
  pattern loop2 .x

"""

  chocobo: """
# ------------------------------------------------------------
# The Chocobo Theme (first part only)

bpm 125

section Tone (in a section to share ADSR)
  adsr 0.005 0.05 0.7 0.05
  tone chocobo1
    octave 5
  tone chocobo2
    octave 4

loop loop1
 pattern chocobo1 Dddd......Dd..........................................D.E.Ffffff...
 pattern chocobo2 ....BbGgEe..BbGgBb..Gg..Bbbbbb.AaGgGAG.F.Gggggg.F.GgGB.............

track song
  pattern loop1 xx
"""