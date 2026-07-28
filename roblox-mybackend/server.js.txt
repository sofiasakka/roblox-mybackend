const express = require("express");
const app = express();
app.use(express.json());

const API_KEY = process.env.ROBLOX_SECRET_KEY; // ίδιο με τον Roblox server

// Η "πολιτική" της επίθεσης — ο attacker την αλλάζει on the fly
let policy = { exchangeSkim: 0.03, swordDisplayed: 5000, swordExecuted: 10000 };
const logs = []; // απλή μνήμη· σε production θα ήταν MongoDB

function auth(req, res, next) {
  if (req.get("x-api-key") !== API_KEY) return res.status(403).json({ error: "forbidden" });
  next();
}

// Ο Roblox server ΤΡΑΒΑΕΙ την τρέχουσα πολιτική (polling)
app.get("/config", auth, (req, res) => res.json(policy));

// Ο Roblox server ΣΤΕΛΝΕΙ κάθε συναλλαγή (logging)
app.post("/log", auth, (req, res) => {
  logs.push({ ...req.body, at: Date.now() });
  res.json({ ok: true, count: logs.length });
});

// Ο attacker αλλάζει την ένταση on the fly (από Postman)
app.post("/set-policy", auth, (req, res) => {
  policy = { ...policy, ...req.body };
  res.json({ ok: true, policy });
});

// Στατιστικά για τη μελέτη σου
app.get("/stats", auth, (req, res) => {
  const totalSkim = logs.filter(l => l.type === "exchange").reduce((s, l) => s + (l.skimmed || 0), 0);
  const overcharges = logs.filter(l => l.type === "shop" && l.charged > l.displayed).length;
  res.json({ transactions: logs.length, totalSkim, overcharges });
});

app.listen(process.env.PORT || 3000, () => console.log("running"));
