// Generated by CoffeeScript 1.6.3
(function() {
  module.exports = {
    first: "# ------------------------------------------------------------\n# Your first LoopScript. Someday there will be documentation!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
    notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed.\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b.\n",
    motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection Bass (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1\n    octave 1\n  tone bass2\n    octave 2\n\nsample clap\n  src samples/clap.wav\nsample snare\n  src samples/snare.wav\nsample hihat\n  src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
    length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n",
    chocobo: "# ------------------------------------------------------------\n# The Chocobo Theme (first part only)\n\nbpm 125\n\nsection Tone (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone chocobo1\n    octave 5\n  tone chocobo2\n    octave 4\n\nloop loop1\n pattern chocobo1 Dddd......Dd..........................................D.E.Ffffff...\n pattern chocobo2 ....BbGgEe..BbGgBb..Gg..Bbbbbb.AaGgGAG.F.Gggggg.F.GgGB.............\n\ntrack song\n  pattern loop1 xx"
  };

}).call(this);
