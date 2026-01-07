const DEFAULT_RATE = 0.05;

const getCommissionRate = () => {
  const raw = Number(process.env.COMMISSION_RATE ?? DEFAULT_RATE);
  if (Number.isNaN(raw)) {
    return DEFAULT_RATE;
  }
  const normalized = raw > 1 ? raw / 100 : raw;
  if (normalized < 0) {
    return DEFAULT_RATE;
  }
  return normalized;
};

module.exports = { getCommissionRate };
