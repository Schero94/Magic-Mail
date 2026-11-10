/**
 * Human-readable text for the sanitized bounce reason codes stored by the
 * server (DNS_NXDOMAIN, SMTP_550_5_1_1, STATUS_4_4_1, UNKNOWN, ...).
 * Reason codes never contain free text or addresses.
 *
 * @param {(id: string, fallback: string, values?: object) => string} t
 * @param {string} code
 * @returns {string}
 */
export const bounceReasonText = (t, code) => {
  if (typeof code !== 'string' || !code || code === 'UNKNOWN') {
    return t('analytics.bounce.unknown', 'Unknown reason');
  }
  if (code === 'DNS_NXDOMAIN') return t('analytics.bounce.nxdomain', 'Domain does not exist');
  const status = code.match(/(?:^|_)([245])_(\d{1,3})_(\d{1,3})$/);
  const enhanced = status ? `${status[1]}.${status[2]}.${status[3]}` : null;
  if (enhanced === '5.1.1' || enhanced === '5.1.10') {
    return t('analytics.bounce.noMailbox', 'Mailbox does not exist ({code})', { code: enhanced });
  }
  if (enhanced === '5.1.2')
    return t('analytics.bounce.badDomain', 'Bad destination domain (5.1.2)');
  if (enhanced === '5.2.2' || enhanced === '4.2.2') {
    return t('analytics.bounce.full', 'Mailbox full ({code})', { code: enhanced });
  }
  if (enhanced?.startsWith('4.')) {
    return t('analytics.bounce.temporary', 'Temporary problem, still retrying ({code})', {
      code: enhanced,
    });
  }
  return enhanced ? t('analytics.bounce.code', 'Status {code}', { code: enhanced }) : code;
};
