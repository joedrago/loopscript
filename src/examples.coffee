module.exports =

  first: """
# ------------------------------------------------------------
# Your first LoopScript. Someday there will be documentation!

tone note1
  duration 800
  adsr 0.005 0.05 0.7 0.05

loop loop1
  pattern note1 a...b...c...d...

  """

  motto: """
# ------------------------------------------------------------
# An approximation of the beat from Drake's "The Motto"

tone bass1
  duration 800
  adsr 0.005 0.05 0.7 0.05

sample clap
  src samples/clap.wav

loop loop1
  pattern bass1 a...b...c...d...
  pattern clap  ....Gg......x...

track song
  pattern loop1 xxxx

  """
