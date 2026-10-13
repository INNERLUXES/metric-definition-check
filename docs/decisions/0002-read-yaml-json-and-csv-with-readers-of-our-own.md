# 2. Read YAML, JSON and CSV with readers of our own

## Status

Accepted

## Context

Dictionaries are written in YAML and in JSON, and lists of reports are exported as CSV from spreadsheets and BI tools. A library
would read full YAML, but full YAML has anchors, aliases, tags, merge keys and several documents, and some readers turn tagged
values into objects. A CSV library may read a lone quote in a way that shifts every column after it. A library is also a
dependency, and the tool has none. The finding of a check should point at a line and a column, which most readers do not keep, and
a key written twice should be an error, which most readers resolve in silence.

## Decision

1. The tool reads JSON with a small reader that keeps the line and column of every key and value, refuses a key written twice and
   a trailing comma, and works through a stack and a loop.
2. The tool reads a documented subset of YAML (docs/inputs.md) with a reader of its own that does the same. It refuses what it does
   not read, with the line and column, instead of guessing: anchors, aliases, tags, mappings in braces, several documents, tabs in
   the indentation, a quoted value over several lines, a plain value with a colon and a space.
3. The tool reads CSV with a strict reader of its own: quotes as in RFC 4180, a comma or a tab as the delimiter, the line and
   column of every cell. It refuses a quote inside a plain cell, text after a closing quote, a quote that is never closed, a
   semicolon as the delimiter, and a file past a limit of rows, columns, cells or length of a cell. It never keeps the first rows
   of a long file and goes on.
4. All readers build or return data kept in maps, so a key such as `__proto__` is only a name. They have limits of size, lines and
   depth, and no function calls itself.
5. `yes`, `no`, `on` and `off` stay text.

## Consequences

- A file that another reader accepts can be refused here, with a message that says why. The cure is to quote the value or to use
  JSON.
- The tool never builds an object from a tag, and a file cannot make it run anything.
- A table that a spreadsheet saved with semicolons has to be saved again with commas. The message says so.
- The subset is documented, and a test compares the readers on the same content.
