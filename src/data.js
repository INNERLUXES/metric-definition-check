// What every report says about itself. The tool reads the metric dictionary of a team, a plain file with the written definitions
// of business measures, and, if there is one, the list of reports that show them. It never connects to a database or a BI tool,
// never runs a formula and never judges whether a number is right. The checks are best practices of this tool: no standard sets
// any of them, and the reports and the documents say so.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about a file (whether it can be read, and its keys and columns), about the dictionary on its own, or about
// the reports set against the dictionary.
export const KINDS = ['file', 'dictionary', 'reports'];

export const NOT_A = 'a read of the wording and the structure of a metric dictionary, and of a list of reports, from plain files; it does not run a formula, does not look at any data and does not know whether a definition is right or a number is correct, and it is neither a data quality tool nor an audit';

export const NOTICE = 'This report reads the dictionary file and the reports file and nothing else. It never connects to data and never runs a formula. A clean result means that none of the problems of its checks were found in them; it is not a statement that the definitions are right, that the numbers are correct or that the reports show what they say.';

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no standard sets it';

// The values of the status of a metric.
export const STATUSES = ['active', 'draft', 'deprecated'];

// The types of a metric, when the dictionary says what kind of measure it is. A rate, a ratio and a count are measured over a period
// and so need a period rule; a ratio and a rate also need a numerator and a denominator.
export const TYPES = ['count', 'distinct_count', 'sum', 'average', 'ratio', 'rate', 'snapshot', 'other'];
export const NEEDS_PERIOD = ['count', 'distinct_count', 'ratio', 'rate'];
export const RATIO_TYPES = ['ratio', 'rate'];

// The words of a name or an id that make the tool read an untyped metric as a ratio, a rate or a count.
export const RATIO_WORDS = ['rate', 'ratio', 'share', 'percentage', 'percent', 'churn', 'retention', 'conversion', 'margin'];
export const COUNT_WORDS = ['count', 'number', 'active', 'new', 'signups', 'visits', 'visitors'];

// The operations of a formula written as a structure.
export const OPERATIONS = ['add', 'subtract', 'multiply', 'divide', 'sum', 'count', 'count_distinct', 'avg', 'min', 'max'];
export const ADDITIVE = ['add', 'subtract'];

// The keys of the dictionary file, of a metric, of the reports file, and of a report, with the other names a key is read under.
export const DICTIONARY_KEYS = ['name', 'description', 'metrics'];
export const METRIC_KEYS = ['id', 'name', 'definition', 'formula', 'unit', 'grain', 'period', 'owner', 'source', 'status', 'replaced_by', 'aliases', 'filters', 'aggregation', 'type', 'numerator', 'denominator', 'note'];
export const METRIC_KEY_ALIASES = new Map([
  ['time_window', 'period'], ['window', 'period'], ['time_period', 'period'],
  ['sources', 'source'], ['source_system', 'source'], ['source_systems', 'source'],
  ['exclusions', 'filters'], ['exclusion', 'filters'], ['filter', 'filters'],
  ['alias', 'aliases']
]);
export const REPORTS_KEYS = ['name', 'description', 'reports'];
export const REPORT_KEYS = ['id', 'name', 'owner', 'metrics', 'note'];
export const SHOWN_KEYS = ['metric', 'label'];
export const COLUMNS = {
  report: ['report', 'report_name', 'dashboard', 'report_id'],
  owner: ['owner', 'report_owner', 'maintainer'],
  metric: ['metric', 'metric_id', 'id'],
  label: ['label', 'shown_as', 'displayed_as', 'name_label', 'title']
};
export const REQUIRED_COLUMNS = ['report', 'metric'];

// The ladders of grain, from the finest to the coarsest. A grain is only compared with one on the same ladder.
export const GRAIN_LADDERS = [
  ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'],
  ['event', 'line_item', 'order', 'customer', 'account', 'region', 'company']
];
export const GRAIN_WORDS = new Map([
  ['daily', 'day'], ['weekly', 'week'], ['monthly', 'month'], ['quarterly', 'quarter'], ['yearly', 'year'], ['annual', 'year'], ['hourly', 'hour'],
  ['days', 'day'], ['weeks', 'week'], ['months', 'month'], ['quarters', 'quarter'], ['years', 'year'], ['hours', 'hour'], ['minutes', 'minute'], ['seconds', 'second'],
  ['events', 'event'], ['line', 'line_item'], ['lines', 'line_item'], ['order_line', 'line_item'], ['order_item', 'line_item'], ['item', 'line_item'], ['line_items', 'line_item'],
  ['orders', 'order'], ['transaction', 'order'], ['transactions', 'order'], ['purchase', 'order'],
  ['customers', 'customer'], ['user', 'customer'], ['users', 'customer'], ['client', 'customer'],
  ['accounts', 'account'], ['regions', 'region'], ['country', 'region'], ['market', 'region'], ['business', 'company'], ['total', 'company']
]);

// The words of a name that carry no meaning when a definition is compared with the name.
export const FILLER_WORDS = ['the', 'a', 'an', 'of', 'is', 'are', 'total', 'number', 'amount', 'count'];

// The defaults of the options, as the text of the option. There is none yet; the object is kept so options can be added.
export const DEFAULTS = {};

// The limits of the work. A file past a limit is refused; the tool never reads a part of a file and goes on.
export const LIMITS = {
  maxBytes: 16 * 1024 * 1024,
  maxLines: 1000000,
  maxDepth: 40,
  maxMetrics: 200000,
  maxReports: 100000,
  maxListItems: 200,
  maxTextLength: 20000,
  maxFormulaDepth: 30,
  maxFormulaNodes: 1000,
  maxRows: 500000,
  maxColumns: 50,
  maxCells: 3000000,
  maxCellLength: 20000
};
