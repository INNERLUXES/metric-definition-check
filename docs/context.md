# Context

This document says what checking a metric dictionary before reports are built on it is good for, and where it misleads. It is
background for reading the reports, not a claim that the tool makes a team's numbers better.

## What the two files are

A team that reports on a business has, written down somewhere, two kinds of thing.

- **The metric dictionary.** The list of the measures the business talks about: revenue, active customers, churn, on-time delivery.
  For each it should hold a definition in words, a formula, a unit, the grain it is calculated at, the period it is measured over,
  an owner, the systems the data comes from, and a status that says whether it is settled, being written or going away. It may also
  hold other names the metric is known by, and what is left in or out.
- **The reports.** The dashboards and reports that show these measures: who owns each one, which metrics it shows, and what it
  calls them on the screen.

The tool reads these two files as text. It never connects to data and never runs a formula, so it is not a data quality tool, and it
is not an audit: it finds the places where the words do not fit, and says nothing about the numbers.

Every number that a manager sees is worked out from the first and shown by the second. If two metrics share one name, two reports
show two numbers under it, and the meeting is about which is right instead of what to do. If a formula names a metric that is not
defined, nobody can follow it. If a rate has no period, "churn" is a week on one screen and a month on another.

The mistakes in these files tend to be the same: a name used twice, a definition that only says the name again, a rate with no
denominator, a sum of a currency and a count, a metric that depends on a draft, a deprecated metric that is still on a dashboard,
an alias that belongs to two metrics. They get past a read of the file by eye and are cheap to find with a tool. This tool reads
them on every change and points at the line.

## Why these checks

- **Dictionary checks** (an id, a name, a definition, a formula, a unit, a grain, a period, an owner, a source, a status) are the
  things a reader needs to build the same number as the last person. Each is a fact about the file; none needs the tool to judge.
- **Dependency checks** (a formula that names an unknown metric, a circle, a unit that does not add up, a grain finer than its input,
  an active metric on a draft, a replaced_by that goes nowhere, two metrics with one formula) find the places where the metrics
  do not fit together. They read the formula as words and braces and follow the names in it.
- **Reports checks** (an unknown metric, a label that is not the name, a deprecated metric that is still shown, one label for two
  metrics, no owner) find the places where the reports and the dictionary do not describe the same business.
- **A summary** (metrics for each status, owner and grain) shows at a glance who owns what, and how much of the dictionary is
  still a draft or on its way out.

## Where it misleads

- **Files are not the business.** The tool sees what the two files hold. It cannot see how a dashboard is really built, which
  filter is on, or whether the dictionary was read by the people who build the reports.
- **A clean report is not a good dictionary.** It means that the problems the tool knows were not found. A dictionary can pass every
  check and still define a metric badly, or hold the wrong definition for the business.
- **A finding can be a choice.** A team may keep a draft that an active metric uses, on purpose, for a week. The tool asks; you
  decide, and the report names every check that was turned off.
- **Names are not meanings.** The tool compares names, aliases, ids and labels as written. It cannot tell two names for one measure
  from two measures with one meaning.
- **A guess is a guess.** With no `type`, the tool guesses from words that a metric is a rate or a count. Set the type and the guess
  goes away.
- **Units are declared, not known.** The unit check compares what the dictionary says. If the dictionary says USD for a count, the
  tool will agree with it.

## Using it well

Keep the dictionary and the list of reports in the repository next to the code that builds the dashboards, and check them on every
change as a step of the build that fails on `error`. Read each finding as a question to the author, not as a verdict. Write down
the options you use in the build so that the next person sees the same rules. Give each metric one owner who can settle a dispute.
Then do the work the tool cannot do: compare the numbers of two reports that show one name, read the definitions as a new colleague
would, and agree with the people who use them what each word means.
