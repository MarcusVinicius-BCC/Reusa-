const counters = new Map();

function increment(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value);
}

function metricsText() {
  return [...counters.entries()]
    .map(([name, value]) => `reusa_${name} ${value}`)
    .join('\n') + '\n';
}

function requestMetrics(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    increment('http_requests_total');
    increment(`http_requests_status_${res.statusCode}`);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (elapsedMs >= 1000) increment('http_slow_requests_total');
  });
  next();
}

module.exports = { increment, metricsText, requestMetrics };
