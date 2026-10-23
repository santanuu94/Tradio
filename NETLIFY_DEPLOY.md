# Tradio - 24/7 Cloud Deployment Guide

This guide explains how to run **both the Tradio Trading Engine and the Next.js Dashboard 24/7 autonomously in the cloud**.

---

## ⚡ The Reality: Can Netlify Run a 24/7 Trading Bot?

- **Netlify alone cannot run a persistent 24/7 background loop.** Netlify is a serverless frontend platform; its functions only run for 10–26 seconds when someone visits the website.
- If you deploy to Netlify alone, your **web dashboard** will stay online 24/7, but the **trading bot will not trade** unless someone or something triggers it.

To have the bot trade around the clock autonomously without keeping your computer on, pick one of the two free options below.

---

## 🏆 Option 1: Koyeb (Best 100% Free 24/7 All-in-One Cloud Runner)

[Koyeb.com](https://www.koyeb.com/) offers a **Free Nano instance (512MB RAM, 0.1 vCPU)** that **never sleeps** and runs 24/7/365 for free.

With the included `Dockerfile` and `start.mjs`, Koyeb runs:
1. The **Background Trading Daemon** (`engine.mjs`) executing trades every 30–60s.
2. The **Next.js Web Dashboard** serving live metrics.

### Steps to Deploy to Koyeb:
1. Push your Tradio folder to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: 24/7 cloud deployment ready"
   git remote add origin https://github.com/YOUR_USERNAME/tradio.git
   git push -u origin main
   ```
2. Go to [app.koyeb.com](https://app.koyeb.com/) and sign up for free.
3. Click **"Create Service"** > **"GitHub"** and select your `tradio` repo.
4. Builder: Select **Dockerfile** (it will auto-detect `Dockerfile` and `start.mjs`).
5. Choose the **Free Eco (Nano)** instance.
6. Click **Deploy**. Both the bot and the dashboard will run 24/7 continuously!

---

## 🥈 Option 2: Netlify (Frontend) + GitHub Actions (24/7 Free Cron Runner)

If you prefer to host your frontend on **Netlify**:

The included workflow `.github/workflows/trade-cycle.yml` automatically runs the trading engine in the cloud on GitHub's free runners every 15 minutes, 24/7.

### How it works:
1. Every 15 minutes, GitHub Actions spins up in the cloud.
2. It runs `node scripts/v2/engine.mjs --once`.
3. It fetches real market data, takes trades, updates equity & memory, and commits the updated `data/` back to your repo.
4. Netlify detects the commit and immediately updates the live dashboard!
5. **Cost**: 100% free (uses only ~600 of GitHub's 2,000 free minutes/month).

### Setup:
1. Push to GitHub.
2. In your GitHub repo settings: **Settings > Actions > General > Workflow permissions**, select **"Read and write permissions"** (so the bot can save trading data).
3. Connect your repo to Netlify (using `netlify.toml`).

---

## 💻 Option 3: Local Daemon + Netlify Frontend

- Run `npm run daemon` on your laptop whenever you want active trading.
- Your Netlify dashboard will display the live synced state.
