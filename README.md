# TAO Scout

Chrome extension: **Bittensor Subnet Intelligence Copilot**.

Core loop:

> What is this? → How healthy is it? → What's changing? → What are the risks? → Why does TAO Scout think that?

## Stage status

| Stage | Status |
|---|---|
| **MVP — Launch** | ✅ Complete in v0.3 |
| **V1 — After users** | Next (alerts, richer charts, daily opportunity report) |
| **V2 — Bigger product** | Later (GPU/miner tools, Telegram, API, payments) |

Payments stay deferred until core functions feel complete.

## MVP Launch checklist (done)

1. Detect subnet  
2. Analyze subnet  
3. Overall score (0–100)  
4. Dimension scores: **Health · Momentum · Development · Market · Risk · Competition**  
5. 7D / 30D trends + significant-change callouts  
6. AI explanation (+ strengths / weaknesses)  
7. Compare 2–5 subnets (matrix + “which is stronger?”)  
8. Full subnet report  

Also included early: Home dashboard + local watchlist (foundation for V1).

## Load / reload

1. Chrome → `chrome://extensions`  
2. Developer mode ON  
3. **Load unpacked** or **Reload** →  

```text
E:\Working\Tinker-Self\Bittensor Subnet Intelligence Copilot\extension
```

4. Open the side panel (extension icon)  
5. Use tabs: **Home · Analyze · Compare · Report**

Demo mode works with no API keys. For live data: Options → Taostats key ([taostats.io/pro](https://taostats.io/pro)). Optional OpenAI key for richer AI text.

## Modules (product map)

```text
TAO SCOUT
   ├── Subnet Analyzer (core)     ✅ MVP
   ├── Compare Subnets            ✅ MVP
   ├── Historical Intelligence    ✅ MVP (7D/30D)
   ├── Watchlist & Alerts         🟡 watchlist only (alerts = V1)
   ├── AI Copilot                 🟡 summary + compare (Q&A = V1/V2)
   └── Miner Opportunity          ⏳ V2
```

## Project layout

```text
extension/
  sidepanel/          Home · Analyze · Compare · Report
  background/         message router
  content/            floating Analyze button
  options/            API keys
  lib/
    detect.js
    metrics.js
    history.js
    scoring.js
    compare.js
    home.js
    watchlist.js
    ai.js
    demo-data.js
    taostats.js
```

## Next (V1) — one by one

1. Watchlist notes + sort  
2. Score / stake / emission / price / miner alerts  
3. Richer historical charts  
4. AI comparison polish + explain-a-score  
5. Daily opportunity report on Home  

Say the word and we’ll start **V1 item 1**.
