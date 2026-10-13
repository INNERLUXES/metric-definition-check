// The tree that both readers (the YAML subset and JSON) build. A node is a scalar, a mapping or a list, and keeps the line and
// column where it starts. A mapping keeps its entries in a Map, so a key such as __proto__ is only a name.

export class ParseError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = 'ParseError';
    this.line = line;
    this.column = column;
  }
}

export const scalarNode = (v, line, col) => ({ t: 's', v, line, col });
export const mapNode = (line, col) => ({ t: 'm', entries: new Map(), line, col });
export const seqNode = (line, col) => ({ t: 'q', items: [], line, col });

// What a node is, for a message.
export function describe(node) {
  if (node.t === 'm') return 'a mapping';
  if (node.t === 'q') return 'a list';
  if (node.v === null) return 'empty';
  if (typeof node.v === 'boolean') return 'a true or false value';
  if (typeof node.v === 'number') return 'a number';
  return 'text';
}
