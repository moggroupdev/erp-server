import { sql } from 'drizzle-orm';
import { check, foreignKey, index, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { APPROVAL_DECISIONS } from 'src/utils/constants';
import { approvalDecisionEnum } from './enums';

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function buildApprovalGate(snake: string) {
  return {
    decision: approvalDecisionEnum(`${snake}_decision`).notNull().default(APPROVAL_DECISIONS.PENDING),
    decidedAt: timestamp(`${snake}_decided_at`, { withTimezone: true }),
    decidedBy: uuid(`${snake}_decided_by`),
    decisionReason: text(`${snake}_decision_reason`),
  };
}

type ApprovalGateBuilders = ReturnType<typeof buildApprovalGate>;

type NamedApprovalGate<P extends string> = {
  [K in `${P}Decision`]: ApprovalGateBuilders['decision'];
} & {
  [K in `${P}DecidedAt`]: ApprovalGateBuilders['decidedAt'];
} & {
  [K in `${P}DecidedBy`]: ApprovalGateBuilders['decidedBy'];
} & {
  [K in `${P}DecisionReason`]: ApprovalGateBuilders['decisionReason'];
};

/** Shared 4-column set for a named approval party. Reuse per gate on any table. */
export function approvalGateColumns<P extends string>(prefix: P): NamedApprovalGate<P> {
  const snake = camelToSnake(prefix);
  const columns = buildApprovalGate(snake);

  return {
    [`${prefix}Decision`]: columns.decision,
    [`${prefix}DecidedAt`]: columns.decidedAt,
    [`${prefix}DecidedBy`]: columns.decidedBy,
    [`${prefix}DecisionReason`]: columns.decisionReason,
  } as NamedApprovalGate<P>;
}

/** FK, indexes, and CHECKs for one gate. `namePrefix` is the table abbrev (e.g. `mprq`). */
export function approvalGateConstraints(
  table: object,
  prefix: string,
  namePrefix: string,
  decidedByRef: AnyPgColumn,
) {
  const snake = camelToSnake(prefix);
  const constraintPrefix = `${namePrefix}_${snake}`;
  const columns = table as Record<string, AnyPgColumn>;
  const decision = columns[`${prefix}Decision`];
  const decidedAt = columns[`${prefix}DecidedAt`];
  const decidedBy = columns[`${prefix}DecidedBy`];
  const decisionReason = columns[`${prefix}DecisionReason`];

  return [
    foreignKey({
      name: `${constraintPrefix}_decided_by_fk`,
      columns: [decidedBy],
      foreignColumns: [decidedByRef],
    }),
    index(`${constraintPrefix}_decision_idx`).on(decision),
    index(`${constraintPrefix}_decided_at_idx`).on(decidedAt),
    index(`${constraintPrefix}_decided_by_idx`).on(decidedBy),
    check(
      `${constraintPrefix}_pending_pair`,
      sql`(${decision} = 'pending') = (${decidedAt} IS NULL) AND (${decision} = 'pending') = (${decidedBy} IS NULL)`,
    ),
    check(
      `${constraintPrefix}_decision_reason_required`,
      sql`(${decision} = 'rejected') = (${decisionReason} IS NOT NULL)`,
    ),
  ];
}
