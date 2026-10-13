// The words of the dictionary format and of the reports file, and the nearest name to a misspelt one.

// The number of single-character edits (insert, delete, replace) between two texts, worked out with two rows.
export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = row;
  }
  return prev[b.length];
}

// The name of the list within two edits of the text, or null.
export function nearest(text, names, within = 2) {
  const t = String(text).slice(0, 80).toLowerCase();
  let best = null;
  let bestDistance = within + 1;
  for (const name of names) {
    const d = editDistance(t, name);
    if (d < bestDistance) {
      best = name;
      bestDistance = d;
    }
  }
  return best;
}
