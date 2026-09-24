function remaining(window) {
  if (!window || !Number.isFinite(window.usedPercent)) return null;
  return {
    remainingPercent: Math.max(0, Math.min(100, Math.round(100 - window.usedPercent))),
    resetsAt: Number.isFinite(window.resetsAt) ? window.resetsAt : null,
  };
}

export function summarizeRateLimits(result) {
  const limits = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
  const windows = [limits?.primary, limits?.secondary];
  return {
    fiveHour: remaining(windows.find(window => window?.windowDurationMins === 300)),
    weekly: remaining(windows.find(window => window?.windowDurationMins === 10080)),
  };
}
