# 3. Read the files on disk, and contact nothing

## Status

Accepted

## Context

A tool that checks a metric dictionary could fetch the definitions from a catalogue, ask a BI tool which reports exist, or look an
owner up in a directory. That would need the network and often a key, would make the result depend on the state of other systems
at the moment of the run, would send the names of metrics and people to a third party, and would let a file in a pull request make
the pipeline reach any address it names.

What a check before dashboards are built needs first is a result that can be repeated: the same files give the same report. The
files are on disk.

## Decision

1. The tool reads the files it is given, and nothing else. It contacts nothing over the network, fetches nothing, needs no key,
   runs no program and sends no data anywhere.
2. A path that looks like an address is refused. A symbolic link, a folder and a device are refused as a dictionary or a reports
   file. A file that is not text, or is too large, is refused with exit code `2` and no report.
3. The tool reads no clock and no locale. Nothing in a check needs the date, so no option gives it one, and the same files give the
   same report on every day. The JUnit report records every time as 0.
4. The tool writes only to standard output and standard error. It keeps no cache, no log and no temporary file.
5. A source system, a formula, a field, an owner or a label written in a file is text. It is never looked up, opened or followed.

## Consequences

- The tool is usable in a pipeline that has no network, and a hostile file cannot make it reach anything.
- The tool does not know whether a source system exists, whether an owner is still at the company, or which reports exist besides
  the ones in the list. The checks work from the files alone, and docs/limits.md says what is not seen.
