import { AuditVerifierService } from '../../../src/domain/services/AuditVerifierService.js';
import TrustService from '../../../src/domain/services/TrustService.js';
import defaultCodec from '../../../src/domain/utils/defaultCodec.js';
import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.js';
import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { verifyAuditSchema } from '../schemas.js';
import { createPersistence, resolveGraphName } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/**
 * Resolves trust pin from CLI flag or environment variable.
 * Domain services never read process.env — resolution happens here at the CLI boundary.
 * @param {string|undefined} cliTrustRefTip - From --trust-ref-tip
 * @returns {{ trustRefTip: string|undefined, pinSource: 'cli_pin'|'env_pin'|undefined }}
 */
function resolveTrustPin(cliTrustRefTip) {
  if (cliTrustRefTip) {
    return { trustRefTip: cliTrustRefTip, pinSource: 'cli_pin' };
  }
  const envPin = process.env.WARP_TRUSTED_ROOT || undefined;
  if (envPin) {
    return { trustRefTip: envPin, pinSource: 'env_pin' };
  }
  return { trustRefTip: undefined, pinSource: undefined };
}

const VERIFY_AUDIT_OPTIONS = {
  since: { type: 'string' },
  writer: { type: 'string' },
  'trust-required': { type: 'boolean', default: false },
  'trust-ref-tip': { type: 'string' },
};

/** @param {string[]} args */
export function parseVerifyAuditArgs(args) {
  const { values } = parseCommandArgs(args, VERIFY_AUDIT_OPTIONS, verifyAuditSchema);
  return {
    since: values.since,
    writerFilter: values.writer,
    trustRequired: values.trustRequired,
    trustRefTip: values.trustRefTip,
  };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleVerifyAudit({ options, args }) {
  const { since, writerFilter, trustRequired, trustRefTip } = parseVerifyAuditArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);

  const crypto = new WebCryptoAdapter();
  const trustService = new TrustService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow persistence type
    graphName,
    crypto,
  });

  const verifier = new AuditVerifierService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow persistence type
    codec: defaultCodec,
    trustService,
  });

  const { trustRefTip: resolvedPin, pinSource } = resolveTrustPin(trustRefTip);

  /** @type {*} */ // TODO(ts-cleanup): type payload union
  let payload;
  if (writerFilter !== undefined) {
    const chain = await verifier.verifyChain(graphName, writerFilter, { since });
    const invalid = chain.status !== 'VALID' && chain.status !== 'PARTIAL' ? 1 : 0;
    const { trust, trustVerdict } = await verifier.evaluateTrust(graphName, {
      trustRefTip: resolvedPin,
      pinSource,
    });
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
      trust,
      integrityVerdict: invalid > 0 ? 'fail' : 'pass',
      trustVerdict,
      trustWarning: null,
    };
  } else {
    payload = await verifier.verifyAll(graphName, {
      since,
      trustRefTip: resolvedPin,
      pinSource,
    });
  }

  // Exit code semantics
  let exitCode = EXIT_CODES.OK;
  if (payload.integrityVerdict === 'fail') {
    exitCode = EXIT_CODES.INTERNAL;
  }
  if (trustRequired && payload.trustVerdict !== 'pass') {
    exitCode = EXIT_CODES.INTERNAL;
  }

  return { payload, exitCode };
}
