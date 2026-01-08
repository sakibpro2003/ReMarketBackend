const CommissionHistory = require("../models/CommissionHistory");

const DEFAULT_RATE = 0.05;
let cachedRate = null;

const normalizeCommissionRate = (value) => {
  const raw = Number(value);
  if (Number.isNaN(raw)) {
    return null;
  }
  const normalized = raw > 1 ? raw / 100 : raw;
  if (normalized < 0 || normalized > 1) {
    return null;
  }
  return normalized;
};

const getCommissionRate = () => {
  if (typeof cachedRate === "number") {
    return cachedRate;
  }
  const fromEnv = normalizeCommissionRate(
    process.env.COMMISSION_RATE ?? DEFAULT_RATE
  );
  return fromEnv ?? DEFAULT_RATE;
};

const setCommissionRate = (value) => {
  const normalized = normalizeCommissionRate(value);
  if (normalized === null) {
    return getCommissionRate();
  }
  cachedRate = normalized;
  return cachedRate;
};

const hydrateCommissionRate = async () => {
  const latest = await CommissionHistory.findOne({})
    .sort({ createdAt: -1 })
    .select("rate")
    .lean();
  if (latest?.rate !== undefined) {
    cachedRate = latest.rate;
  }
  return getCommissionRate();
};

module.exports = {
  getCommissionRate,
  setCommissionRate,
  hydrateCommissionRate,
  normalizeCommissionRate
};
