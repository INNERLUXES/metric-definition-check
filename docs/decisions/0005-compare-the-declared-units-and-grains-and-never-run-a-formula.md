# 5. Compare the declared units and grains, and never run a formula

## Status

Accepted

## Context

Two of the most useful checks of a metric dictionary need a little understanding of a formula: that a sum does not add a currency
amount to a count, and that a daily figure is not built from a monthly one. Understanding a formula fully means parsing a language
and then running it, with the risks of both: a parser that accepts a different language from the one the team writes, and an
evaluator that a file can make run code. Teams also write formulas in many ways: SQL fragments, spreadsheet-like text, structures.

## Decision

1. A formula written as text is read into words, numbers, operators and `{metric_id}` references, with parentheses. Nothing is
   evaluated. A formula written as a structure is read the same way as a tree with a limit on parts and depth.
2. Only one thing is understood about the shape of a formula: which terms are added or subtracted, and whether one thing is divided
   by another. A term is compared for its unit only when it is exactly one metric with a declared unit. Anything else is skipped.
3. A grain is compared only on two ladders of the tool, and only when both grains are on the same ladder. Another grain is skipped.
4. A metric is read as a rate, a ratio or a count from its `type`, or, if it has none, from words in its name and id, its unit and a
   division. The words are listed in docs/inputs.md, and the finding says when the reading is a guess.
5. The readers have no recursion and no pattern built from the formula.

## Consequences

- The tool finds the common mistakes in a sum or in a grain, and none of the subtle ones.
- A formula in a language the tool does not know is still compared as text and still gives its `{metric_id}` references.
- A team that wants real unit algebra needs a tool that runs the formulas, which is a different tool with a different risk.
