# 4. Check wording and structure, and never claim the numbers are right

## Status

Accepted

## Context

A tool that reads a metric dictionary invites the question whether the metrics are right. It could try to answer: compare a
definition with a formula, say which of two formulas is better, claim that a dictionary that passes is ready for use. It cannot do
this from two files, and a tool that appears to do it is worse than one that does not, because a team will stop asking.

No standard sets the content of a metric dictionary, so a check cannot be defended as a rule. It can be defended as a question that
costs little to ask and often finds something.

## Decision

1. Every check is a best practice of this tool and says so in its `own` text. No document, message or example says that a standard
   asks for it.
2. The tool checks wording and structure: that a definition is there and says more than the name, that a formula is there and names
   metrics that exist, that a name belongs to one metric. It does not say that a definition is right.
3. A clean result is worded "no finding at or above the level". The notice at the end of every report says what it does not mean:
   that the definitions are right, that the numbers are correct, or that the reports show what they say.
4. The tool says it is not a data quality tool and not an audit, in the README, in docs/limits.md and in the description of the
   package.
5. Where the tool has to guess (whether an untyped metric is a rate or a count), the guess is documented, the `type` key turns it
   off, and the finding says that it is a guess.

## Consequences

- A team can put the check in its build without reading it as a stamp of approval.
- A real problem in a definition that is well formed is not found. The tool leaves that to the owners of the metrics.
- Some findings will be choices. The report names the checks that were turned off, and the options never change what a check asks.
