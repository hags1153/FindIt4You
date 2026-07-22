# Deploying FindIt4You (on this server, alongside RaceScan)

The app runs as a **PM2** process on `127.0.0.1:4200` and is fronted by **nginx** for a domain
with **Let's Encrypt** TLS — the same pattern as TorchDoor. Nothing here touches RaceScan
(separate systemd services + ports). Every nginx change is validated with `nginx -t` *before*
reload, so a mistake can't take other sites down.

## Already done (by Claude, no sudo needed)
- App under PM2: `pm2 start server.js --name findit4you` + `pm2 save` (auto-starts on reboot).
- Health: `curl localhost:4200` → 200.

## Your part

### 1. DNS (at your registrar)
Point the domain at this server:

| Type | Host | Value |
|------|------|-------|
| A    | @    | `99.166.72.87` |
| A    | www  | `99.166.72.87` |

Wait for it to propagate, then confirm:
```bash
dig +short YOURDOMAIN     # should print 99.166.72.87
```

### 2. nginx (needs sudo — run these yourself, or via `! sudo ...` in this session)
Replace `YOURDOMAIN` with your domain:
```bash
DOMAIN=YOURDOMAIN
sed "s/DOMAIN/$DOMAIN/g" /home/racescanserver/Documents/repos/findit4you/deploy/nginx-findit4you.conf \
  | sudo tee /etc/nginx/sites-available/findit4you >/dev/null
sudo ln -sf /etc/nginx/sites-available/findit4you /etc/nginx/sites-enabled/findit4you
sudo nginx -t                 # MUST say "syntax is ok / test is successful" before continuing
sudo systemctl reload nginx   # graceful — does not drop RaceScan
```
If `nginx -t` fails, STOP — don't reload; fix the file first. RaceScan stays safe either way.

### 3. TLS (needs sudo)
```bash
sudo certbot --nginx -d YOURDOMAIN -d www.YOURDOMAIN
```
Certbot issues the cert, rewrites the nginx block to serve HTTPS, and adds the http→https redirect.
Auto-renewal is already handled by the system certbot timer.

### 4. Verify
```bash
curl -I https://YOURDOMAIN     # 200, and the page loads over TLS
```

## Ops cheatsheet
- Logs: `pm2 logs findit4you`
- Restart after a code change: `git pull && pm2 restart findit4you`
- Re-seed demo data: `node scripts/seed.js`
- `.env` (Supabase keys) lives at the repo root, gitignored — must exist for the app to start.
