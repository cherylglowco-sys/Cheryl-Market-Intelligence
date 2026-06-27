# Deploy Cheryl Market Intelligence to Render

## What you need

- A GitHub account
- A Render account
- This folder pushed to a GitHub repository

## Files Render needs

These are already included:

- `server.js` - Node web server
- `public/` - dashboard UI
- `package.json` - start script
- `render.yaml` - Render Blueprint config

## Step 1: Put this folder on GitHub

Create a new GitHub repository, then upload all files from this folder:

`C:\Users\user\Documents\Codex\2026-06-27\i`

Do not upload `node_modules` if it exists.

## Step 2: Create the Render service

1. Go to Render.
2. Choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Select the repo containing this project.
5. Render will read `render.yaml`.

## Step 3: Set private login variables

When Render asks for environment variables, set:

- `DASHBOARD_USER` - your login username
- `DASHBOARD_PASSWORD` - your login password

These protect the public dashboard URL.

## Step 4: Deploy

Click deploy. Render will build with:

`npm install`

And start with:

`npm start`

When deployment finishes, open the `.onrender.com` URL.

## Notes

- The free Render plan may sleep when idle, so first load can be slow.
- TradingView widgets require the browser to load TradingView's external iframe.
- ForexFactory may rate-limit; the dashboard falls back to the built-in macro calendar.
