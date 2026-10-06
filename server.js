const express = require("express");

const app = express();
app.use(express.json({ limit: "10kb" }));

const API_KEY = process.env.ROBLOX_SECRET_KEY;

// ---------------------------------------------------------
// Experimental configuration
// ---------------------------------------------------------

const DEFAULT_PRODUCT = {
  productId: 16895215,
  name: "Darkheart",
  gemsPerBuy: 5000,
  displayedPrice: 5000,
  effectivePrice: 5000,
  interactionCount: 0,
  level: 0
};

const products = new Map();

products.set(String(DEFAULT_PRODUCT.productId), {
  ...DEFAULT_PRODUCT
});

const logs = [];

// ---------------------------------------------------------
// Authentication
// ---------------------------------------------------------

function auth(req, res, next) {
  if (!API_KEY || req.get("x-api-key") !== API_KEY) {
    return res.status(403).json({ error: "forbidden" });
  }

  next();
}

// ---------------------------------------------------------
// Experimental level
//
// The level is derived from aggregate product interactions,
// not from individual players.
// ---------------------------------------------------------

function calculateLevel(interactions) {
  if (interactions >= 1000) return 3;
  if (interactions >= 500) return 2;
  if (interactions >= 100) return 1;
  return 0;
}

// ---------------------------------------------------------
// Experimental parameters
//
// These values are deliberately kept in the external service.
// For the experiment they represent simulated conditions.
// ---------------------------------------------------------

function calculateExperimentalPolicy(level, basePrice) {
  switch (level) {
    case 1:
      return {
        displayedPrice: basePrice,
        effectivePrice: basePrice + 250
      };

    case 2:
      return {
        displayedPrice: basePrice,
        effectivePrice: basePrice + 500
      };

    case 3:
      return {
        displayedPrice: basePrice,
        effectivePrice: basePrice + 1000
      };

    default:
      return {
        displayedPrice: basePrice,
        effectivePrice: basePrice
      };
  }
}

// ---------------------------------------------------------
// Update product state
// ---------------------------------------------------------

function updateProduct(productId) {
  const key = String(productId);

  let product = products.get(key);

  if (!product) {
    product = {
      productId: Number(productId),
      name: `Product ${productId}`,
      gemsPerBuy: 5000,
      displayedPrice: 5000,
      effectivePrice: 5000,
      interactionCount: 0,
      level: 0
    };

    products.set(key, product);
  }

  product.level = calculateLevel(product.interactionCount);

  const policy = calculateExperimentalPolicy(
    product.level,
    product.displayedPrice
  );

  product.effectivePrice = policy.effectivePrice;

  return product;
}

// ---------------------------------------------------------
// GET /config
//
// Roblox polls this endpoint.
// ---------------------------------------------------------

app.get("/config", auth, (req, res) => {
  const productId = req.query.productId;

  if (productId) {
    const product = updateProduct(productId);

    return res.json({
      productId: product.productId,
      gemsPerBuy: product.gemsPerBuy,
      swordDisplayed: product.displayedPrice,
      swordExecuted: product.effectivePrice,
      interactionCount: product.interactionCount,
      policyLevel: product.level
    });
  }

  const result = {};

  for (const [id] of products) {
    const product = updateProduct(id);

    result[id] = {
      productId: product.productId,
      gemsPerBuy: product.gemsPerBuy,
      swordDisplayed: product.displayedPrice,
      swordExecuted: product.effectivePrice,
      interactionCount: product.interactionCount,
      policyLevel: product.level
    };
  }

  res.json(result);
});

// ---------------------------------------------------------
// POST /interaction
//
// Increments the aggregate interaction counter for a product.
// ---------------------------------------------------------

app.post("/interaction", auth, (req, res) => {
  const { productId, interactionType = "purchase_attempt" } = req.body;

  if (productId === undefined) {
    return res.status(400).json({
      error: "productId is required"
    });
  }

  const product = updateProduct(productId);

  product.interactionCount += 1;

  updateProduct(productId);

  logs.push({
    type: "interaction",
    productId: product.productId,
    interactionType,
    interactionCount: product.interactionCount,
    policyLevel: product.level,
    at: Date.now()
  });

  res.json({
    ok: true,
    productId: product.productId,
    interactionCount: product.interactionCount,
    policyLevel: product.level
  });
});

// ---------------------------------------------------------
// POST /log
//
// Transaction logging.
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// POST /set-policy
//
// Manual experimental control.
// ---------------------------------------------------------

app.post("/set-policy", auth, (req, res) => {
  const {
    productId,
    gemsPerBuy,
    displayedPrice
  } = req.body;

  if (productId === undefined) {
    return res.status(400).json({
      error: "productId is required"
    });
  }

  const product = updateProduct(productId);

  if (gemsPerBuy !== undefined) {
    product.gemsPerBuy = Number(gemsPerBuy);
  }

  if (displayedPrice !== undefined) {
    product.displayedPrice = Number(displayedPrice);
  }

  updateProduct(productId);

  res.json({
    ok: true,
    product
  });
});

// ---------------------------------------------------------
// GET /stats
// ---------------------------------------------------------

app.get("/stats", auth, (req, res) => {
  const exchanges = logs.filter(
    x => x.type === "exchange"
  );

  const shops = logs.filter(
    x => x.type === "shop"
  );

  const interactions = logs.filter(
    x => x.type === "interaction"
  );

  const totalDisplayed = exchanges.reduce(
    (sum, x) => sum + Number(x.displayed || 0),
    0
  );

  const totalCredited = exchanges.reduce(
    (sum, x) => sum + Number(x.credited || 0),
    0
  );

  const totalDisplayedShopValue = shops.reduce(
    (sum, x) => sum + Number(x.displayed || 0),
    0
  );

  const totalEffectiveShopValue = shops.reduce(
    (sum, x) => sum + Number(x.charged || 0),
    0
  );

  const discrepancies = shops.filter(
    x => Number(x.charged || 0) !== Number(x.displayed || 0)
  );

  res.json({
    transactions: logs.length,

    exchanges: exchanges.length,

    shopTransactions: shops.length,

    interactions: interactions.length,

    totalDisplayedExchangeValue: totalDisplayed,

    totalCreditedExchangeValue: totalCredited,

    totalDisplayedShopValue,

    totalEffectiveShopValue,

    discrepancyTransactions: discrepancies.length,

    products: Array.from(products.values()).map(product => ({
      productId: product.productId,
      name: product.name,
      interactionCount: product.interactionCount,
      policyLevel: product.level,
      displayedPrice: product.displayedPrice,
      effectivePrice: product.effectivePrice
    }))
  });
});

// ---------------------------------------------------------
// GET /health
// ---------------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "experimental-policy-service"
  });
});

// ---------------------------------------------------------
// Start
// ---------------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Experimental policy service running on port ${PORT}`);
});
