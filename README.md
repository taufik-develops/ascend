# Critique Clone — your AI life coach (phone + laptop)

A working web app in the style of Critique AI: photo scanners, a chat coach, a voice coach,
a daily plan, XP and a rank ladder. It runs in any browser, so the **same code works on your
laptop and your phone** — no app store needed.

Powered by the **Google Gemini API** (free tier), using model **`gemini-3.8-flash`**.

> **When a model gets retired:** Google rotates models out every few months. If you ever see
> *"this model is no longer available"*, you do **not** need to rewrite anything — just open
> `http://localhost:3000/api/models`, copy a model name from the list, set `GEMINI_MODEL=` to it
> in your `.env`, and restart. That's the whole fix.

---

## Part 1 — Run it on your laptop (5 minutes)

You need **Node.js 18 or newer**. Check by opening a terminal and typing `node -v`.
If that errors, install it from https://nodejs.org (take the LTS version).

```bash
cd critique-clone
npm install          # downloads the 3 libraries this project uses
```

### Add your Gemini key
1. In the `critique-clone` folder, find the file **`.env.example`**.
2. Make a copy of it and rename the copy to exactly **`.env`** (yes, it starts with a dot).
   - Mac/Linux shortcut: `cp .env.example .env`
   - Windows shortcut: `copy .env.example .env`
3. Open `.env` in any text editor and replace `paste_your_key_here` with your real key:
   ```
   GEMINI_API_KEY=AIza...your-actual-key...
   ```
4. Save the file.

### Start it
```bash
npm start
```
Open **http://localhost:3000** in your browser. The terminal should say `Gemini key: loaded ✅`.

> If you see the yellow "No API key loaded" banner in the app, your `.env` is missing,
> misnamed, or the server wasn't restarted after you edited it. Stop with `Ctrl+C` and `npm start` again.

---

## Part 2 — Open it on your phone

Both devices must be on the **same Wi-Fi**.

1. On the laptop, find its local IP address:
   - Windows: `ipconfig` → look for "IPv4 Address" (e.g. `192.168.1.7`)
   - Mac: `ipconfig getifaddr en0`
   - Linux: `hostname -I`
2. On your phone's browser, go to `http://192.168.1.7:3000` (use your own number).
3. In Chrome, tap **⋮ → Add to Home screen**. It now opens like a real app, full screen.

**Camera and microphone note:** browsers only allow camera/mic on `localhost` or on an
`https://` address. The photo scanners work fine over local Wi-Fi (they use a normal file
picker, which opens your camera on Android). The **Voice Coach mic will not work over plain
http on your phone** — to fix that, run `npx localtunnel --port 3000` (or use ngrok) and
open the `https://` link it gives you.

---

## Automatic fallback (OpenRouter)

Add a second key to `.env` and the app heals itself when Google has a bad day:

```
OPENROUTER_API_KEY=sk-or-v1-...your-key...
OPENROUTER_MODEL=thinkingmachines/inkling:free
```

> **OpenRouter's free list changes without warning.** A model that was free last month can
> flip to paid overnight. If the backup starts failing with *"unavailable for free"*, open
> **http://localhost:3000/api/models/free** — it shows what is genuinely free right now,
> sorted with the best ones for this app first. Copy an id into `OPENROUTER_MODEL` and restart.
>
> The app deliberately will **not** auto-switch to the paid model OpenRouter suggests in its
> error message — that would quietly start charging you.

**Gemini is always tried first.** The backup only fires when Gemini returns one of:
rate limit (429), server outage (5xx), a retired model, or a safety refusal on your photo.
When it happens the result card shows a small "⚡ analysed by the backup model" note,
and the terminal logs `[fallback] ...`. You don't have to do anything.

Health check: open **http://localhost:3000/api/health** to ping both providers at once
and see exactly which is up.

**Gemini is retried before the backup is used.** "High demand" errors from Google are
usually over in seconds, so the app retries twice (1.5s then 4s) before spending any of
your small OpenRouter free quota. You'll see `[retry] Gemini busy...` in the terminal.

**Voice Coach fallback** works too, as long as `OPENROUTER_MODEL` accepts audio.
The default (`inkling:free`) does — check the `accepts` field in `/api/models/free`
before switching to a different model.

---

## What's in each file

| File | What it does |
|---|---|
| `server.js` | The backend. **The only file that touches your API key.** Receives photos/audio/messages from the browser, forwards them to Gemini, sends the answer back. |
| `prompts.js` | Every instruction given to the AI. Want a harsher or funnier coach? Edit this file only. |
| `public/index.html` | The app's structure — all five screens and both pop-ups. |
| `public/styles.css` | The dark neon-green look. |
| `public/app.js` | All browser logic: navigation, tasks, XP, rank ladder, uploads, chat, recording. |
| `.env` | Your secret key. Never commit or share this. |
| `.gitignore` | Already set up so `.env` can't be pushed to GitHub by accident. |

---

## Features

- **Today's Plan** — 8 daily habits across morning/afternoon/evening, each worth XP. Tap to complete.
- **Coach Features** — Physique Scan, Food Scanner, Posture Analysis, Rate My Outfit. Upload a photo, get a scored card with stats, strengths and fixes.
- **Chat with Coach** — conversational coaching that remembers the last 12 messages.
- **Voice Coach** — records you answering a random prompt, then scores clarity, pace, filler words and confidence.
- **Rank Ladder** — 10 ranks from Kickoff to Legendary, 0 → 52,000 XP.
- **Profile** — streak, total XP, scans done, reset button.

Progress is saved in your browser's `localStorage`. It is per-device and clears if you
clear browser data — see "Next steps" to make it permanent.

---

## Costs and limits

The Gemini free tier gives you a few hundred to ~1,500 requests per day on Flash models,
with a per-minute cap. If you see a "429" error, you've hit the per-minute limit —
wait sixty seconds. You will not be charged unless you deliberately enable billing.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Gemini key: MISSING ❌` | `.env` is named wrong (`.env.txt` is the usual culprit) or you didn't restart the server. |
| "This model is no longer available" | Google retired it. Open **http://localhost:3000/api/models** to list the models your key can actually use, put one in `GEMINI_MODEL=` in `.env`, restart. |
| Error mentioning `temperature` / `top_p` | Gemini 3.x removed those settings. This project already uses `thinkingLevel` instead — don't re-add them. |
| "Gemini declined to answer" | Safety filter. Use a clearer, well-lit photo; for physique shots, a plain gym photo works best. |
| HTTP 429 | Free-tier rate limit. Wait a minute. |
| Phone can't load the page | Not on the same Wi-Fi, or your laptop firewall is blocking port 3000. |
| Mic does nothing on phone | Expected over http — use the localtunnel/https trick above. |

---

## Using it on yourself (the point)

- **History + trend** — every scan is saved to the Profile tab with its score. The app shows
  your 7-day average and whether it's up or down versus the week before. That number is the
  only real measure of whether this is working.
- **Back up your progress** — Profile → *Export backup* saves a `.json` file. Do this
  occasionally. Clearing browser data wipes everything otherwise. *Restore from backup*
  brings it back, and is also how you move progress from laptop to phone.

## Next steps when you're ready

1. **Real accounts + cloud saves** — add Supabase (free): email login and a `profiles` table for XP, so progress follows the user across devices.
2. **Put it online** — deploy to Render or Railway (free tier), set `GEMINI_API_KEY` in their dashboard's environment variables, and you get an https URL where the mic works everywhere.
3. **Faster chat** — add a Groq key and route only `/api/chat` to it for near-instant replies.
4. **Real app store build** — port the same screens to Expo (React Native); the backend stays exactly as it is.
5. **Rate limiting** — before sharing the URL publicly, add `express-rate-limit` so nobody can drain your quota.

---

⚠️ **Disclaimer:** This app gives general wellness and coaching guidance only.
It is not medical, nutritional, or psychological advice. Keep that notice visible in the
app (it's on the Profile screen) if you ever publish it.
