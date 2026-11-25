import { useMagicMailIntl } from '../../hooks/useMagicMailIntl';

/**
 * Tries of an outbox mail in words: "2 tries, 1 failed" once it is done,
 * "2 of 4 tries, 2 failed" while more tries can follow.
 *
 * @param {object} props
 * @param {{total: number, max: number, failed: number, open: boolean}} props.tries - from outboxTries()
 * @returns {string}
 */
export const TriesText = ({ tries }) => {
  const { t } = useMagicMailIntl();
  const values = { total: tries.total, max: tries.max, failed: tries.failed };
  return tries.open
    ? t(
        'queue.tries.open',
        '{total} of {max} tries{failed, plural, =0 {} other {, # failed}}',
        values
      )
    : t(
        'queue.tries.done',
        '{total, plural, one {# try} other {# tries}}{failed, plural, =0 {} other {, # failed}}',
        values
      );
};

export default TriesText;
