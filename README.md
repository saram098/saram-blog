# saram.thebotss.com

Astro static blog. Pushed to `main`, built by GitHub Actions, rsynced to AWS, served by Node under pm2 on port 4321.

## One-time setup

### 1. On the AWS box

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -   # if Node < 20
sudo apt-get install -y nodejs rsync
bash scripts/server-setup.sh
```

Generate the deploy key **on your laptop**, not the server:

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-saram-blog"
ssh-copy-id -i deploy_key.pub USER@YOUR_AWS_IP     # or paste deploy_key.pub into ~/.ssh/authorized_keys
```

Security group: allow inbound 22 from anywhere (GitHub runners have rotating IPs), or use a self-hosted runner if you want 22 closed.

### 2. GitHub repo secrets

Settings, Secrets and variables, Actions:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | AWS public IP or hostname |
| `DEPLOY_USER` | SSH username (`ubuntu`, `ec2-user`, ...) |
| `DEPLOY_PORT` | `22` unless changed |
| `DEPLOY_PATH` | absolute path, e.g. `/home/ubuntu/apps/saram-blog` |
| `DEPLOY_KEY` | contents of the private `deploy_key` file |
| `DEVTO_API_KEY` | dev.to API key |

### 3. Reverse proxy

Point `saram.thebotss.com` at `127.0.0.1:4321`. Nginx:

```nginx
server {
  server_name saram.thebotss.com;
  location / {
    proxy_pass http://127.0.0.1:4321;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then `sudo certbot --nginx -d saram.thebotss.com` for TLS.

### 4. DNS

`saram` A record at thebotss.com, pointing to the AWS public IP.

## Writing

One markdown file in `src/content/blog/`. Push to `main`. It builds, deploys and cross-posts to dev.to with the canonical URL set to this site.

```yaml
---
title: "Post title"
description: "One sentence for search and social."
pubDate: 2026-09-22
tags: ["agents", "azure-ai"]
cover: "/images/whatever.png"
draft: false
---
```
