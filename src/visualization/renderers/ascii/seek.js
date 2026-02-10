/**
 * ASCII renderer for the `seek --view` command.
 *
 * Displays a swimlane dashboard: one horizontal track per writer, with
 * relative-offset column headers that map directly to `--tick=+N/-N` CLI
 * syntax.  Included patches (at or before the cursor) render as filled
 * dots on a solid line; excluded (future) patches render as open circles
 * on a dotted line.
 */

import boxen from 'boxen';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { formatSha, formatWriterName } from './formatters.js';
import { TIMELINE } from './symbols.js';
import { formatOpSummary } from './opSummary.js';

/** Maximum number of tick columns shown in the windowed view. */
const MAX_COLS = 9;

/** Character width of each tick column (marker + connector gap). */
const COL_W = 6;

/** Character width reserved for the writer name column. */
const NAME_W = 10;

/** Middle-dot used for excluded-zone connectors. */
const DOT_MID = '\u00B7'; // ·

/** Open circle used for excluded-zone patch markers. */
const CIRCLE_OPEN = '\u25CB'; // ○

function formatDelta(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) {
    return '';
  }
  const sign = n > 0 ? '+' : '';
  return ` (${sign}${n})`;
}

function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

function buildReceiptLines(tickReceipt) {
  if (!tickReceipt || typeof tickReceipt !== 'object') {
    return [];
  }

  const entries = Object.entries(tickReceipt)
    .filter(([writerId, entry]) => writerId && entry && typeof entry === 'object')
    .sort(([a], [b]) => a.localeCompare(b));

  const lines = [];
  for (const [writerId, entry] of entries) {
    const sha = typeof entry.sha === 'string' ? entry.sha : null;
    const opSummary = entry.opSummary && typeof entry.opSummary === 'object' ? entry.opSummary : entry;
    const name = padRight(formatWriterName(writerId, NAME_W), NAME_W);
    const shaStr = sha ? `  ${formatSha(sha)}` : '';
    lines.push(`    ${name}${shaStr}  ${formatOpSummary(opSummary, 40)}`);
  }

  return lines;
}

// ============================================================================
// Window
// ============================================================================

/**
 * Computes a sliding window of tick positions centered on the current tick.
 *
 * When all points fit within {@link MAX_COLS}, the full array is returned.
 * Otherwise a window of MAX_COLS entries is centered on `currentIdx`, with
 * clamping at both ends.
 *
 * @param {number[]} allPoints - All tick positions (including virtual tick 0)
 * @param {number} currentIdx - Index of the current tick in `allPoints`
 * @returns {{ points: number[], currentCol: number, moreLeft: boolean, moreRight: boolean }}
 */
function computeWindow(allPoints, currentIdx) {
  if (allPoints.length <= MAX_COLS) {
    return {
      points: allPoints,
      currentCol: currentIdx,
      moreLeft: false,
      moreRight: false,
    };
  }

  const half = Math.floor(MAX_COLS / 2);
  let start = currentIdx - half;
  if (start < 0) {
    start = 0;
  }
  let end = start + MAX_COLS;
  if (end > allPoints.length) {
    end = allPoints.length;
    start = end - MAX_COLS;
  }

  return {
    points: allPoints.slice(start, end),
    currentCol: currentIdx - start,
    moreLeft: start > 0,
    moreRight: end < allPoints.length,
  };
}

// ============================================================================
// Header row
// ============================================================================

/**
 * Builds the column header row showing relative step offsets.
 *
 * The current tick is rendered as `[N]` (absolute tick number); all other
 * columns show their signed step distance (`-2`, `-1`, `+1`, `+2`, etc.)
 * matching the `--tick=+N/-N` CLI syntax.
 *
 * @param {{ points: number[], currentCol: number }} win - Computed window
 * @returns {string} Formatted, indented header line
 */
function buildHeaderRow(win) {
  const { points, currentCol } = win;
  let header = '';

  for (let i = 0; i < points.length; i++) {
    const rel = i - currentCol;
    let label;
    if (rel === 0) {
      label = `[${points[i]}]`;
    } else if (rel > 0) {
      label = `+${rel}`;
    } else {
      label = String(rel);
    }
    header += label.padEnd(COL_W);
  }

  const margin = ' '.repeat(NAME_W + 2);
  return `  ${margin}${header.trimEnd()}`;
}

// ============================================================================
// Writer swimlane
// ============================================================================

/**
 * Renders a single cell (marker) in the swimlane grid.
 *
 * @param {boolean} hasPatch - Whether this writer has a patch at this tick
 * @param {boolean} incl - Whether this tick is in the included zone
 * @returns {string} A single styled character
 */
function renderCell(hasPatch, incl) {
  if (hasPatch) {
    return incl ? colors.success(TIMELINE.dot) : colors.muted(CIRCLE_OPEN);
  }
  return incl ? TIMELINE.line : colors.muted(DOT_MID);
}

/**
 * Builds the swimlane track string for a writer across the window columns.
 *
 * @param {Set<number>} patchSet - Set of ticks where this writer has patches
 * @param {number[]} points - Window tick positions
 * @param {number} currentTick - Active seek cursor tick
 * @returns {string} Styled swimlane track
 */
function buildLane(patchSet, points, currentTick) {
  let lane = '';
  for (let i = 0; i < points.length; i++) {
    const t = points[i];
    const incl = t <= currentTick;

    if (i > 0) {
      const n = COL_W - 1;
      lane += incl
        ? TIMELINE.line.repeat(n)
        : colors.muted(DOT_MID.repeat(n));
    }

    lane += renderCell(patchSet.has(t), incl);
  }
  return lane;
}

/**
 * Builds one writer's horizontal swimlane row.
 *
 * Each tick position in the window gets a marker character:
 * - `●` (green)  — writer has a patch here AND tick ≤ currentTick (included)
 * - `○` (muted)  — writer has a patch here AND tick > currentTick (excluded)
 * - `─` (solid)  — no patch, included zone
 * - `·` (muted)  — no patch, excluded zone
 *
 * Between consecutive columns, connector characters of the appropriate style
 * fill the gap (COL_W − 1 chars).
 *
 * @param {Object} opts
 * @param {string} opts.writerId
 * @param {Object} opts.writerInfo - `{ ticks, tipSha, tickShas }`
 * @param {{ points: number[] }} opts.win - Computed window
 * @param {number} opts.currentTick - Active seek cursor tick
 * @returns {string} Formatted, indented swimlane line
 */
function buildWriterSwimRow({ writerId, writerInfo, win, currentTick }) {
  const patchSet = new Set(writerInfo.ticks);
  const tickShas = writerInfo.tickShas || {};
  const lane = buildLane(patchSet, win.points, currentTick);

  // SHA of the highest included patch
  const included = writerInfo.ticks.filter((t) => t <= currentTick);
  const maxIncl = included.length > 0 ? included[included.length - 1] : null;
  const sha = maxIncl !== null
    ? (tickShas[maxIncl] || writerInfo.tipSha)
    : writerInfo.tipSha;

  const name = padRight(formatWriterName(writerId, NAME_W), NAME_W);
  const shaStr = sha ? `  ${formatSha(sha)}` : '';

  return `    ${name}  ${lane}${shaStr}`;
}

// ============================================================================
// Body assembly
// ============================================================================

/**
 * Builds the tick-position array and index of the current tick.
 *
 * Ensures the current tick is always present: if `tick` is absent from
 * `ticks` (e.g. saved cursor after writer refs changed), it is inserted
 * at the correct sorted position so the window always centres on it.
 *
 * @param {number[]} ticks - Discovered Lamport ticks
 * @param {number} tick - Current cursor tick
 * @returns {{ allPoints: number[], currentIdx: number }}
 */
function buildTickPoints(ticks, tick) {
  const allPoints = (ticks[0] === 0) ? [...ticks] : [0, ...ticks];
  let currentIdx = allPoints.indexOf(tick);
  if (currentIdx === -1) {
    let ins = allPoints.findIndex((t) => t > tick);
    if (ins === -1) {
      ins = allPoints.length;
    }
    allPoints.splice(ins, 0, tick);
    currentIdx = ins;
  }
  return { allPoints, currentIdx };
}

/**
 * Builds the body lines for the seek dashboard.
 *
 * @param {Object} payload - Seek payload from the CLI handler
 * @returns {string[]} Lines for the box body
 */
function buildSeekBodyLines(payload) {
  const { graph, tick, maxTick, ticks, nodes, edges, patchCount, perWriter, diff, tickReceipt } = payload;
  const lines = [];

  lines.push('');
  lines.push(`  ${colors.bold('GRAPH:')} ${graph}`);
  lines.push(`  ${colors.bold('POSITION:')} tick ${tick} of ${maxTick}`);
  lines.push('');

  if (ticks.length === 0) {
    lines.push(`  ${colors.muted('(no ticks)')}`);
  } else {
    const { allPoints, currentIdx } = buildTickPoints(ticks, tick);
    const win = computeWindow(allPoints, currentIdx);

    // Column headers with relative offsets
    lines.push(buildHeaderRow(win));

    // Per-writer swimlanes
    const writerEntries = perWriter instanceof Map
      ? [...perWriter.entries()]
      : Object.entries(perWriter).map(([k, v]) => [k, v]);

    for (const [writerId, writerInfo] of writerEntries) {
      lines.push(buildWriterSwimRow({ writerId, writerInfo, win, currentTick: tick }));
    }
  }

  lines.push('');
  const edgeLabel = pluralize(edges, 'edge', 'edges');
  const nodeLabel = pluralize(nodes, 'node', 'nodes');
  const patchLabel = pluralize(patchCount, 'patch', 'patches');

  const nodesStr = `${nodes} ${nodeLabel}${formatDelta(diff?.nodes)}`;
  const edgesStr = `${edges} ${edgeLabel}${formatDelta(diff?.edges)}`;
  lines.push(`  ${colors.bold('State:')} ${nodesStr}, ${edgesStr}, ${patchCount} ${patchLabel}`);

  const receiptLines = buildReceiptLines(tickReceipt);
  if (receiptLines.length > 0) {
    lines.push('');
    lines.push(`  ${colors.bold(`Tick ${tick}:`)}`);
    lines.push(...receiptLines);
  }
  lines.push('');

  return lines;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Renders the seek view dashboard inside a double-bordered box.
 *
 * @param {Object} payload - Seek payload from the CLI handler
 * @returns {string} Boxen-wrapped ASCII dashboard with trailing newline
 */
export function renderSeekView(payload) {
  const lines = buildSeekBodyLines(payload);
  const body = lines.join('\n');

  return `${boxen(body, {
    title: ' SEEK ',
    titleAlignment: 'center',
    padding: 0,
    borderStyle: 'double',
    borderColor: 'cyan',
  })}\n`;
}
