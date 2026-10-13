# name-clash

- Level: error
- Kind: dictionary

**What it looks at.** one name or alias used by two different metrics \(compared without case and without extra spaces\): the classic way two reports show two numbers under one name; a deprecated metric that names the other in replaced\_by is left out

**Why it exists.** Requiring a name or an alias to belong to one metric is a best practice of this tool; no standard sets it; a reader who sees the name in two reports cannot tell which definition stands behind the number

**What to change.** Give each metric a name of its own that says what is different \(for example "Revenue \(booked\)" and "Revenue \(recognised\)"\), and remove the alias from the metric that does not own it.

**What it cannot see.** It compares the written names and aliases. It cannot tell two names for one measure \("Sales" and "Revenue"\) from two measures, and it cannot see a name that is only used in a dashboard.

This check is a best practice of this tool; no standard sets it.
