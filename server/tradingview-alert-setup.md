# TradingView Alert Setup for ORB Automation

## Step 1: Add NQ Chart
Open TradingView and load an **NQ1!** (E-mini Nasdaq 100 continuous) chart.
Set the timeframe to **1 minute**.

## Step 2: Create a Webhook Alert

1. Click the **Alert** button (clock icon) or press `Alt+A`
2. Configure the alert:
   - **Condition**: NQ1! → Crossing → value of `0` (this creates a "every bar" alert)

   OR better — use this method:
   - **Condition**: NQ1! → "Every bar close"

3. **Alert actions**: Check **"Webhook URL"**
4. **Webhook URL**: Paste your ngrok URL + endpoint:
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/api/tv-tick
   ```
5. **Message** (this is the JSON body TradingView sends):
   ```json
   {"price": {{close}}}
   ```
6. **Expiration**: Set to "Open-ended" or the maximum allowed by your TradingView plan
7. **Alert name**: "NQ Price Feed for ORB"

## Step 3: Alternative — Pine Script for More Control

If you want ticks more frequently, add this indicator to your chart:

```pine
//@version=5
indicator("ORB Price Feed", overlay=true)

// This indicator does nothing visually — it just provides
// a condition that fires every bar so the alert sends price data.
// Set alert on this indicator with "Any alert() function call"

if barstate.isconfirmed
    alert('{"price": ' + str.tostring(close) + '}', alert.freq_once_per_bar)
```

Then create an alert on this indicator:
- Condition: "ORB Price Feed" → "Any alert() function call"
- Webhook URL: your ngrok URL
- No need to set the Message field — the Pine Script handles it

## What Happens

Every minute (on each bar close), TradingView sends:
```json
POST https://your-ngrok-url/api/tv-tick
{"price": 18402.50}
```

Our server receives the price and feeds it to the ORB engine.
During the 15-minute Opening Range window, it tracks high/low.
When a breakout occurs, it triggers the full automation pipeline.

## Notes

- Free TradingView plan: 1 active alert (enough for this)
- Pro plan: 20+ alerts with faster webhook delivery
- The 1-minute resolution is fine for ORB (15-min window)
- For sub-minute ticks, use a lower timeframe chart (15s, 30s) if your plan supports it
