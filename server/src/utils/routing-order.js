'use strict';

/**
 * Evaluation order of routing rules: highest priority first; rules with the
 * same priority in creation order (oldest first). GET /routing-rules (the
 * admin list) and the router both use it, so the list shows the order in
 * which rules are evaluated.
 *
 * Returns a new array on every call, so a caller can never change the order
 * used by the other.
 *
 * @returns {Array<Record<string, 'asc'|'desc'>>} Document Service `sort`
 */
const routingRuleEvaluationSort = () => [{ priority: 'desc' }, { createdAt: 'asc' }];

module.exports = { routingRuleEvaluationSort };
