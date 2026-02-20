import process from 'node:process';
import { parseCommandArgs, usageError } from '../infrastructure.js';
import { viewSchema } from '../schemas.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const VIEW_OPTIONS = {
  list: { type: 'boolean', default: false },
  log: { type: 'boolean', default: false },
};

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleView({ options, args }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw usageError('view command requires an interactive terminal (TTY)');
  }

  const { values, positionals } = parseCommandArgs(args, VIEW_OPTIONS, viewSchema, { allowPositionals: true });
  const viewMode = values.log || positionals[0] === 'log' ? 'log' : 'list';

  try {
    // @ts-expect-error — optional peer dependency, may not be installed
    const { startTui } = await import('@git-stunts/git-warp-tui');
    await startTui({
      repo: options.repo || '.',
      graph: options.graph || 'default',
      mode: viewMode,
    });
  } catch (err) {
    const errObj = /** @type {{code?: string, message?: string, specifier?: string}} */ (typeof err === 'object' && err !== null ? err : {});
    const isMissing = errObj.code === 'ERR_MODULE_NOT_FOUND' || (errObj.message && errObj.message.includes('Cannot find module'));
    const isTui = errObj.specifier?.includes('git-warp-tui') ||
      /cannot find (?:package|module) ['"]@git-stunts\/git-warp-tui/i.test(errObj.message || '');
    if (isMissing && isTui) {
      throw usageError(
        'Interactive TUI requires @git-stunts/git-warp-tui.\n' +
        '  Install with: npm install -g @git-stunts/git-warp-tui',
      );
    }
    throw err;
  }
  return { payload: undefined, exitCode: 0 };
}
