# Cheryl Market Intelligence

Mission-control dashboard for crypto, macro, and equity news that may affect your watchlist.

## Run locally

```bash
npm start
```

Then open `http://localhost:5173`.

## Deploy on Render

1. Create a GitHub repository and push this folder.
2. In Render, choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Render reads `render.yaml` and creates the web service.
5. When prompted, set `DASHBOARD_USER` and `DASHBOARD_PASSWORD`.
6. Deploy, then open the Render URL.

If you create a normal **Web Service** instead of a Blueprint, use:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`
- Environment variables: `DASHBOARD_USER`, `DASHBOARD_PASSWORD`

Password protection is enabled only when both `DASHBOARD_USER` and `DASHBOARD_PASSWORD` are set.
