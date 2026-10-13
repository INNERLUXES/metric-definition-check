// Text from the input: control characters (C0 and C1), the line and paragraph separators and the Unicode direction controls,
// built from their code points so that this file holds only ASCII. Every text that comes from the input goes through safeText
// before it reaches a report or an error message.

const span = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const UNSAFE_CHARACTERS = new RegExp(`[${span(0, 0x1f)}${span(0x7f, 0x9f)}${[0x200e, 0x200f, 0x2028, 0x2029, 0xfeff].map((c) => String.fromCharCode(c)).join('')}${span(0x202a, 0x202e)}${span(0x2066, 0x2069)}]`, 'g');

// Text from the input: control, line separator and direction characters replaced by a space, length capped.
export function safeText(value, max = 300) {
  const s = String(value).slice(0, max * 4).replace(UNSAFE_CHARACTERS, ' ');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

// A text with runs of white space as one space, so a value written over several lines reads as one line.
export const flat = (text) => text.replace(/\s+/g, ' ').trim();

// Text for XML 1.0: a lone surrogate, and the two characters U+FFFE and U+FFFF, which it cannot hold, become a question mark.
// Built from code points so that this file holds only ASCII.
const HIGH = span(0xd800, 0xdbff);
const LOW = span(0xdc00, 0xdfff);
const XML_INVALID = new RegExp(`[${HIGH}](?![${LOW}])|(?<![${HIGH}])[${LOW}]|[${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}]`, 'g');
export const xmlSafe = (value) => String(value).replace(XML_INVALID, '?');

// The full-width question mark.
export const FULL_WIDTH_QUESTION = String.fromCharCode(0xff1f);
