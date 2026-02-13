import { AuditVerifierService } from '../../../src/domain/services/AuditVerifierService.js';
import defaultCodec from '../../../src/domain/utils/defaultCodec.js';
import { EXIT_CODES, usageError } from '../infrastructure.js';
import { createPersistence, resolveGraphName } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/** @param {string[]} args */
export function parseVerifyAuditArgs(args) {
  /** @type {string|undefined} */
  let since;
  /** @type {string|undefined} */
  let writerFilter;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since') {
      if (args[i + 1] === undefined) {
        throw usageError('Missing value for --since');
      }
      since = args[i + 1];
      i++;
    } else if (args[i] === '--writer') {
      if (args[i + 1] === undefined) {
        throw usageError('Missing value for --writer');
      }
      writerFilter = args[i + 1];
      i++;
    } else if (args[i].startsWith('-')) {
      throw usageError(`Unknown verify-audit option: ${args[i]}`);
    } else {
      throw usageError(`Unexpected verify-audit argument: ${args[i]}`);
    }
  }

  return { since, writerFilter };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleVerifyAudit({ options, args }) {
  const { since, writerFilter } = parseVerifyAuditArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const verifier = new AuditVerifierService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow port type
    codec: defaultCodec,
  });

  /** @type {*} */ // TODO(ts-cleanup): type verify-audit payload
  let payload;
  if (writerFilter) {
    const chain = await verifier.verifyChain(graphName, writerFilter, { since });
    const invalid = chain.status !== 'VALID' && chain.status !== 'PARTIAL' ? 1 : 0;
    payload = {
      graph: graphName,
      verifiedAt: new Date().toISOString(),
      summary: {
        total: 1,
        valid: chain.status === 'VALID' ? 1 : 0,
        partial: chain.status === 'PARTIAL' ? 1 : 0,
        invalid,
      },
      chains: [chain],
      trustWarning: null,
    };
  } else {
    payload = await verifier.verifyAll(graphName, { since });
  }

  const hasInvalid = payload.summary.invalid > 0;
  return {
    payload,
    exitCode: hasInvalid ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}
