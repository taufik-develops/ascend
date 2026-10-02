# Pushing to GitHub + deploying — copy/paste guide

Everything here runs on **your** laptop. Nobody else needs access to your accounts.

---

## Step 0 — Safety check (do this first, every time)

```bash
npm run check-secrets
```

It must print `SAFE`. If it prints `DANGER`, your `.env` is about to be uploaded —
stop and tell me before doing anything else.

---

## Step 1 — Create the repo on GitHub

1. Go to github.com → **＋** (top right) → **New repository**
2. Name: `ascend`
3. **Select Private.** This is your personal app with your prompts in it.
4. Do **not** tick "Add a README" — you already have one.
5. Click **Create repository**

GitHub now shows you a page of commands. Ignore it, use the ones below.

---

## Step 2 — Push (run inside the `critique-clone` folder)

```bash
git init
git add .
git commit -m "Ascend - AI life coach"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ascend.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username.

### If it asks for a password
GitHub stopped accepting account passwords. You need a **Personal Access Token**:

1. github.com → your avatar → **Settings**
2. Bottom left → **Developer settings**
3. **Personal access tokens → Tokens (classic) → Generate new token (classic)**
4. Note: `laptop`. Expiry: 90 days. Tick the **`repo`** checkbox.
5. **Generate token** → copy it (shown once)
6. Back in the terminal, paste the token where it asks for *password*

> That token is a password. Don't paste it into any chat, including this one.

---

## Step 3 — Deploy on Render

1. render.com → **Get Started** → sign in with GitHub
2. Authorise Render for your `ascend` repo only (not all repos)
3. **New → Web Service** → select `ascend`
4. Render detects `render.yaml` — leave the build settings alone
5. Open the **Environment** section and add:

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your Gemini key |
   | `OPENROUTER_API_KEY` | your OpenRouter key |

   Type them straight into Render. They are never in your code.
6. **Create Web Service** → first build takes ~3 minutes

You'll get `https://ascend-xxxx.onrender.com`.

---

## Step 4 — Check it, then install it

Open `https://your-url.onrender.com/api/health` first.
Both providers should say `working ✅`.

Then open the main URL on your phone → Chrome **⋮ → Install app**.

---

## Making changes later

```bash
git add .
git commit -m "what you changed"
git push
```

Render redeploys automatically within a couple of minutes. Your phone app updates
on next open — no reinstall.

---

## If something breaks

- **Build failed** → Render dashboard → **Logs** tab. Usually a typo in `package.json`.
- **App loads, AI doesn't work** → the env vars didn't save. Re-add them, then **Manual Deploy → Clear build cache & deploy**.
- **"Application failed to respond"** → free tier was asleep. Wait 50 seconds and refresh.
