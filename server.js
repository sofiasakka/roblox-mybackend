const express = require("express");

const app = express();

app.use(express.json({ limit: "10kb" }));

const API_KEY = process.env.ROBLOX_SECRET_KEY;

const DEFAULT_PRODUCT_ID = 16895215;

const DEFAULT_POLICY = {
  productId: DEFAULT_PRODUCT_ID,

  // Existing policy parameters
  exchangeSkim: 0,
  gemsPerBuy: 5000,
  swordDisplayed: 5000,
  swordExecuted: 5000,

  // Aggregate measurements
  interactionCount: 0,
  purchaseCount: 0
};

// Product-specific policies and counters
const products = new Map();

products.set(String(DEFAULT_PRODUCT_ID), {
  ...DEFAULT_POLICY
});

// Experimental event log
const logs = [];

/* =========================================================
   AUTHENTICATION
   ========================================================= */

function auth(req, res, next) {
  if (!API_KEY || req.get("x-api-key") !== API_KEY) {
    return res.status(403).json({
      error: "forbidden"
    });
  }

  next();
}

/* =========================================================
   PRODUCT MANAGEMENT
   ========================================================= */

function getProduct(productId) {
  const id = Number(productId);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const key = String(id);

  if (!products.has(key)) {
    products.set(key, {
      productId: id,
      exchangeSkim: 0,
      gemsPerBuy: 5000,
      swordDisplayed: 5000,
      swordExecuted: 5000,
      interactionCount: 0,
      purchaseCount: 0
    });
  }

  return products.get(key);
}

/* =========================================================
   CONFIG
   ========================================================= */

app.get("/config", auth, (req, res) => {
  const productId =
    req.query.productId !== undefined
      ? req.query.productId
      : DEFAULT_PRODUCT_ID;

  const product = getProduct(productId);

  if (!product) {
    return res.status(400).json({
      error: "invalid productId"
    });
  }

  res.json(product);
});

/* =========================================================
   INTERACTION TRACKING
   ========================================================= */

app.post("/interaction", auth, (req, res) => {
  const {
    productId,
    interactionType = "purchase_attempt",
    experimentId = "unknown",
    userId = null
  } = req.body;

  if (productId === undefined) {
    return res.status(400).json({
      error: "productId is required"
    });
  }

  const product = getProduct(productId);

  if (!product) {
    return res.status(400).json({
      error: "invalid productId"
    });
  }

  // Every interaction increments interactionCount.
  product.interactionCount += 1;

  // Only a confirmed successful purchase increments purchaseCount.
  if (interactionType === "purchase") {
    product.purchaseCount += 1;
  }

  const record = {
    type: "interaction",

    productId: product.productId,
    interactionType,

    experimentId,
    userId,

    interactionCount: product.interactionCount,
    purchaseCount: product.purchaseCount,

    timestamp: new Date().toISOString(),
    at: Date.now()
  };

  logs.push(record);

  res.json({
    ok: true,
    productId: product.productId,

    interactionCount: product.interactionCount,
    purchaseCount: product.purchaseCount
  });
});

/* =========================================================
   GENERAL EVENT LOGGING
   ========================================================= */

app.post("/log", auth, (req, res) => {
  const record = {
    ...req.body,

    timestamp: new Date().toISOString(),
    at: Date.now()
  };

  logs.push(record);

  res.json({
    ok: true,
    count: logs.length
  });
});

/* =========================================================
   CHANGE POLICY
   ========================================================= */

app.post("/set-policy", auth, (req, res) => {
  const {
    productId,
    exchangeSkim,
    gemsPerBuy,
    swordDisplayed,
    swordExecuted
  } = req.body;

  const targetProductId =
    productId !== undefined
      ? productId
      : DEFAULT_PRODUCT_ID;

  const product = getProduct(targetProductId);

  if (!product) {
    return res.status(400).json({
      error: "invalid productId"
    });
  }

  if (exchangeSkim !== undefined) {
    product.exchangeSkim = Number(exchangeSkim);
  }

  if (gemsPerBuy !== undefined) {
    product.gemsPerBuy = Number(gemsPerBuy);
  }

  if (swordDisplayed !== undefined) {
    product.swordDisplayed = Number(swordDisplayed);
  }

  if (swordExecuted !== undefined) {
    product.swordExecuted = Number(swordExecuted);
  }

  res.json({
    ok: true,
    policy: product
  });
});

/* =========================================================
   RESET PRODUCT
   ========================================================= */

app.post("/reset", auth, (req, res) => {
  const productId =
    req.body.productId !== undefined
      ? req.body.productId
      : DEFAULT_PRODUCT_ID;

  const product = getProduct(productId);

  if (!product) {
    return res.status(400).json({
      error: "invalid productId"
    });
  }

  product.exchangeSkim = 0;
  product.gemsPerBuy = 5000;
  product.swordDisplayed = 5000;
  product.swordExecuted = 5000;

  product.interactionCount = 0;
  product.purchaseCount = 0;

  res.json({
    ok: true,
    policy: product
  });
});

/* =========================================================
   LOGS
   ========================================================= */

app.get("/logs", auth, (req, res) => {
  const {
    productId,
    type,
    experimentId
  } = req.query;

  let result = [...logs];

  if (productId !== undefined) {
    result = result.filter(
      log =>
        String(log.productId) === String(productId)
    );
  }

  if (type !== undefined) {
    result = result.filter(
      log =>
        log.type === type
    );
  }

  if (experimentId !== undefined) {
    result = result.filter(
      log =>
        log.experimentId === experimentId
    );
  }

  res.json({
    count: result.length,
    logs: result
  });
});

/* =========================================================
   STATISTICS
   ========================================================= */

app.get("/stats", auth, (req, res) => {
  const {
    productId,
    experimentId
  } = req.query;

  let filteredLogs = [...logs];

  if (productId !== undefined) {
    filteredLogs = filteredLogs.filter(
      log =>
        String(log.productId) === String(productId)
    );
  }

  if (experimentId !== undefined) {
    filteredLogs = filteredLogs.filter(
      log =>
        log.experimentId === experimentId
    );
  }

  const exchanges = filteredLogs.filter(
    log => log.type === "exchange"
  );

  const shops = filteredLogs.filter(
    log => log.type === "shop"
  );

  const interactions = filteredLogs.filter(
    log => log.type === "interaction"
  );

  const totalSkim = exchanges.reduce(
    (sum, log) =>
      sum + Number(log.skimmed || 0),
    0
  );

  const overcharges = shops.filter(
    log =>
      Number(log.charged || 0) >
      Number(log.displayed || 0)
  );

  const productStats = Array.from(
    products.values()
  )
    .filter(product => {
      if (productId === undefined) {
        return true;
      }

      return (
        String(product.productId) ===
        String(productId)
      );
    })
    .map(product => ({
      productId: product.productId,

      interactionCount:
        product.interactionCount,

      purchaseCount:
        product.purchaseCount,

      exchangeSkim:
        product.exchangeSkim,

      gemsPerBuy:
        product.gemsPerBuy,

      swordDisplayed:
        product.swordDisplayed,

      swordExecuted:
        product.swordExecuted
    }));

  res.json({
    transactions: filteredLogs.length,

    exchanges: exchanges.length,

    shopTransactions:
      shops.length,

    interactions:
      interactions.length,

    totalSkim,

    overcharges:
      overcharges.length,

    products:
      productStats
  });
});

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "experimental-policy-service"
  });
});

/* =========================================================
   SERVER
   ========================================================= */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Experimental policy service running on port ${PORT}`
  );
});
