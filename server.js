const express = require("express");

const app = express();
app.use(express.json({ limit: "10kb" }));

const API_KEY = process.env.ROBLOX_SECRET_KEY;

// ======================================================
// DEFAULT PRODUCT
// ======================================================

const DEFAULT_PRODUCT_ID = 16895215;

const DEFAULT_POLICY = {
  productId: DEFAULT_PRODUCT_ID,
  exchangeSkim: 0,
  gemsPerBuy: 5000,
  swordDisplayed: 5000,
  swordExecuted: 5000,

  // Νέα στοιχεία για σύνδεση με το προϊόν
  interactionCount: 0,
  purchaseCount: 0
};

// Κάθε product έχει τη δική του policy/state
const products = new Map();

products.set(String(DEFAULT_PRODUCT_ID), {
  ...DEFAULT_POLICY
});

// ======================================================
// LOGS
// ======================================================

const logs = [];

// ======================================================
// AUTHENTICATION
// ======================================================

function auth(req, res, next) {
  if (!API_KEY || req.get("x-api-key") !== API_KEY) {
    return res.status(403).json({ error: "forbidden" });
  }

  next();
}

// ======================================================
// PRODUCT MANAGEMENT
// ======================================================

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

// ======================================================
// CONFIG
// ======================================================

// Χωρίς productId:
// επιστρέφει την policy του default product.
//
// Με productId:
// επιστρέφει την policy του συγκεκριμένου προϊόντος.

app.get("/config", auth, (req, res) => {
  const productId = req.query.productId || DEFAULT_PRODUCT_ID;

  const product = getProduct(productId);

  if (!product) {
    return res.status(400).json({
      error: "invalid productId"
    });
  }

  res.json(product);
});

// ======================================================
// INTERACTION
// ======================================================

// Καταγράφει interaction με συγκεκριμένο προϊόν.
//
// Δεν εξαρτάται από συγκεκριμένο player.
// Το interaction συνδέεται με το Product ID.

app.post("/interaction", auth, (req, res) => {
  const {
    productId,
    interactionType = "purchase_attempt"
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

  product.interactionCount += 1;

  if (interactionType === "purchase") {
    product.purchaseCount += 1;
  }

  logs.push({
    type: "interaction",
    productId: product.productId,
    interactionType,
    interactionCount: product.interactionCount,
    purchaseCount: product.purchaseCount,
    at: Date.now()
  });

  res.json({
    ok: true,
    productId: product.productId,
    interactionCount: product.interactionCount,
    purchaseCount: product.purchaseCount
  });
});

// ======================================================
// LOGGING
// ======================================================

app.post("/log", auth, (req, res) => {
  const record = {
    ...req.body,
    at: Date.now()
  };

  logs.push(record);

  res.json({
    ok: true,
    count: logs.length
  });
});

// ======================================================
// MANUAL POLICY UPDATE
// ======================================================
//
// Κρατάμε συμβατότητα με τα ΠΑΛΙΑ curl commands.
//
// Αν δοθεί productId, αλλάζει η policy του συγκεκριμένου
// προϊόντος.
//
// Αν ΔΕΝ δοθεί productId, αλλάζει το DEFAULT PRODUCT.
//
// ======================================================

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

// ======================================================
// RESET PRODUCT
// ======================================================

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
// ======================================================
// DETAILED LOGS
// ======================================================
//
// Επιστρέφει αναλυτικά όλα τα recorded events:
// - exchange
// - shop / purchase
// - interaction
//
// Προαιρετικά:
// /logs?productId=16895215
// /logs?type=exchange
// /logs?type=shop
// /logs?type=interaction
// ======================================================

app.get("/logs", auth, (req, res) => {
  const { productId, type } = req.query;

  let result = [...logs];

  // Filter by Product ID
  if (productId !== undefined) {
    result = result.filter(
      log => String(log.productId) === String(productId)
    );
  }

  // Filter by event type
  if (type !== undefined) {
    result = result.filter(
      log => log.type === type
    );
  }

  res.json({
    count: result.length,
    logs: result
  });
});

// ======================================================
// STATS
// ======================================================

app.get("/stats", auth, (req, res) => {
  const exchanges = logs.filter(
    l => l.type === "exchange"
  );

  const shops = logs.filter(
    l => l.type === "shop"
  );

  const interactions = logs.filter(
    l => l.type === "interaction"
  );

  // Συνολικό skim
  const totalSkim = exchanges.reduce(
    (sum, l) => sum + Number(l.skimmed || 0),
    0
  );

  // Overcharges
  const overcharges = shops.filter(
    l =>
      Number(l.charged || 0) >
      Number(l.displayed || 0)
  );

  // Product statistics
  const productStats = Array.from(products.values()).map(
    product => ({
      productId: product.productId,
      interactionCount: product.interactionCount,
      purchaseCount: product.purchaseCount,

      exchangeSkim: product.exchangeSkim,
      gemsPerBuy: product.gemsPerBuy,

      swordDisplayed: product.swordDisplayed,
      swordExecuted: product.swordExecuted
    })
  );

  res.json({
    transactions: logs.length,

    exchanges: exchanges.length,
    shopTransactions: shops.length,
    interactions: interactions.length,

    totalSkim,
    overcharges: overcharges.length,

    products: productStats
  });
});

// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "experimental-policy-service"
  });
});

// ======================================================
// START
// ======================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Experimental policy service running on port ${PORT}`
  );
});
