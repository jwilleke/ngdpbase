[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/tightenLists

# converters/ncm/fix/tightenLists

Remove empty lines between list items, so the list renders "tight" (#1271).

In CommonMark one empty line anywhere between the items of a list makes the
whole list "loose": every item's text is wrapped in a paragraph and the list
is spread out. Authors often leave an empty line only to group items in the
source — "Antibiotics:" and its sub-items, an empty line, "Antitoxin
therapy:" — and get a spaced-out list they did not ask for. An empty line
between two items of one list never ends the list, so removing it changes
the spacing and nothing else.

Works on each top-level list together with the lists nested in it, and
deliberately narrow:

- only an empty line whose next non-empty line starts an item of the same
    top-level list;
- the list is skipped when any item has a real second block after an
    empty line (a second paragraph, a code block): there the empty line is
    meaning, and the list stays loose whatever else is removed;
- the list is also skipped when an item's text runs onto a second line.
    showdown turns that line into a `<br>` only in a loose list and joins it
    into one line in a tight one, so tightening would lose the break until
    the converter swap (#1273). markdown-it keeps it either way.

The result is parsed again; if the list items are not exactly the ones
before, nothing is changed.

## Variables

- [tightenLists](variables/tightenLists.md)
