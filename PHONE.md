# Getting Ascend onto your phone

Three routes, easiest first. **Option B is the one you want** for daily use.

---

## Option A — Local Wi-Fi (0 minutes, laptop must be on)

1. Laptop: `npm start`
2. Find the laptop's IP: `ipconfig` (Windows) / `ipconfig getifaddr en0` (Mac) / `hostname -I` (Linux)
3. Phone browser: `http://192.168.1.x:3000`

Photo scanners work. **Mic does not** — browsers block microphone access on plain `http`.
No install prompt either, for the same reason. Fine for testing, annoying daily.

---

## Option B — Free hosting, real home-screen app ⭐

Gives you an `https://` address, so: the microphone works, the install prompt appears,
and it runs whether or not your laptop is on. Free tier, no card.

### 1. Put the code on GitHub
```bash
cd critique-clone
git init
git add .
git commit -m "Ascend"
```
Create an empty repo on github.com (set it **Private**), then run the two commands
GitHub shows you to push.

> Your `.env` is already in `.gitignore`, so your keys will NOT be uploaded. Verify with
> `git status` — if you ever see `.env` listed, stop and fix it before pushing.

### 2. Deploy on Render
1. Sign up at render.com with GitHub
2. **New → Web Service** → pick your repo
3. Render reads `render.yaml` automatically (build `npm install`, start `npm start`)
4. Before clicking deploy, open **Environment** and add your two secrets:
   - `GEMINI_API_KEY` = your key
   - `OPENROUTER_API_KEY` = your key
5. Deploy. You get `https://ascend-xxxx.onrender.com`

### 3. Install it on your phone
Open that URL in Chrome → **⋮ → Install app** (or *Add to Home screen*).

You now have an Ascend icon in your app drawer. Opens full screen, no browser bar,
microphone works, no laptop needed.

> **Free tier caveat:** Render sleeps the service after ~15 minutes idle, so the first
> open after a break takes 30-50 seconds to wake. Every open after that is instant.
> Paid tier (~$7/mo) removes the sleep — only worth it if the wait genuinely bugs you.

---

## Option C — A real `.apk` file

Only worth doing *after* Option B, because an APK still needs that hosted backend.

Easiest path: go to **pwabuilder.com**, paste your Render URL, and it generates a signed
APK you can sideload. No Android Studio needed. You cannot put it on the Play Store
without a developer account ($25 one-time) — but for personal use, sideloading is fine.

---

## Which should you actually pick?

If you'll use this most days: **B**, once, and never think about it again.
If you're still deciding whether you'll use it at all: **A** for a week first, then B.
