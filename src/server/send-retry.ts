/** Retry only definite rate-limit rejections, never an accepted or uncertain send.
 * 131049 is a recipient marketing policy decision and must not enter this path. */
export function sendRetryPlan(errorCode: unknown, variables: any, now = new Date()) {
  if (!['429', '130429', '131056'].includes(String(errorCode))) return null;
  const attempts = Number(variables?.__send_retry_count || 0);
  if (!Number.isInteger(attempts) || attempts < 0 || attempts >= 3) return null;
  const delaySeconds = 30 * 2 ** attempts;
  return {scheduledAt: new Date(now.getTime() + delaySeconds * 1000),
    variables: {...(variables || {}), __send_retry_count: String(attempts + 1), __send_retry_reason: String(errorCode)}};
}
