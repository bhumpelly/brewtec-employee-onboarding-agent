# Deployment

Two ways to run the agent: locally for development and the demo, and on a server in Germany for production. Step-by-step setup of the services and credentials is in [SETUP.md](SETUP.md).

## 1. Local (current setup)

| Part | How it runs |
|---|---|
| n8n 2.37.10 | Docker on Windows, port 5678, volume `n8n_data`, settings from an env file outside the repository |
| Database | Supabase cloud project (Postgres, pgvector, pgcrypto, Vault) |
| Public link | `cloudflared tunnel --url http://localhost:5678` (trycloudflare). The link changes on every restart |
| Monitoring | `monitoring/docker-compose.yml`, Grafana on port 3001 |

Start n8n:

```powershell
docker run -d --name n8n --restart unless-stopped -p 5678:5678 `
  -v n8n_data:/home/node/.n8n --env-file "$HOME\n8n.env" `
  docker.n8n.io/n8nio/n8n:2.37.10
```

Use [`n8n.env.example`](../n8n.env.example) as the template for `$HOME\n8n.env`. Keep the real file outside the repository.

> With trycloudflare, `WEBHOOK_URL` and the links in e-mails must be updated after every restart. Start the tunnel before a demo and check the welcome e-mail link.

### Tested through the tunnel (31 Oct 2026)

| Address | Result |
|---|---|
| `https://<tunnel>/webhook/brewtec` | Public company page, no login, no assistant |
| `https://<tunnel>/webhook/brewtec/employees` | Browser login box, after a personal login the site with the assistant. Chat answers with sources |

Known limits of the quick tunnel: a new random address on every restart, e-mail links still point to `localhost:5678`, and nothing is reachable while the PC sleeps.

### Next step: a fixed address with a named tunnel

Needs an own domain whose DNS is on Cloudflare (for example bought through Cloudflare, about 10 EUR a year).

1. Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel**, type Cloudflared, name `brewtec`.
2. Install it as a Windows service with the token shown: `cloudflared service install <token>` (keep the token private).
3. Public hostname: `brewtec.<domain>` → HTTP `localhost:5678`.
4. Set `WEBHOOK_URL=https://brewtec.<domain>/` in the n8n env file and recreate the container. Change `chat_url` and `pfb_form_url` in the Config nodes of workflows 1 and 4.
5. Optional: Cloudflare Access with a one-time code to the company e-mail in front of `/webhook/brewtec/employees`, `/hr` and `/payroll`.

## 2. Production on a server in Germany (roadmap)

Plan for a Hetzner Cloud server, not yet deployed. Any Linux server with Docker works the same way.

### Server
- Ubuntu 24.04, location Falkenstein or Nuremberg (data stays in Germany), 4 GB RAM.
- Firewall: port 22 only from your own IP, ports 80 and 443 open.
- SSH key login, no password login.
- A hostname: a domain with an A record, or `n8n.<ip-with-dashes>.sslip.io` for testing.

### Move the workflows without touching the running system
On the current machine, export while n8n keeps running:

```powershell
docker exec n8n n8n export:workflow --all --separate --output=/tmp/export/workflows/
docker exec n8n n8n export:credentials --all --separate --output=/tmp/export/credentials/
docker cp n8n:/tmp/export .\n8n_export
```

Credentials stay encrypted in the export. The server needs the **same** `N8N_ENCRYPTION_KEY`, found in the env file or in `/home/node/.n8n/config` inside the container. Put it in the server's env file **before the first start**, otherwise n8n creates a new key and the credentials cannot be decrypted.

### docker-compose.yml on the server

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data"]
  n8n:
    image: n8nio/n8n:2.37.10
    container_name: n8n
    restart: unless-stopped
    env_file: n8n.env
    environment:
      - N8N_HOST=n8n.example.de
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.example.de/
      - N8N_PROXY_HOPS=1
      - GENERIC_TIMEZONE=Europe/Berlin
      - TZ=Europe/Berlin
    volumes: ["n8n_data:/home/node/.n8n"]
volumes:
  n8n_data:
  caddy_data:
```

### Caddyfile (automatic HTTPS)

```
n8n.example.de {
    reverse_proxy n8n:5678
}
```

The employee area already has its own personal login (workflow 5 and `08_website_logins.sql`), so Caddy only adds HTTPS. The public page `/webhook/brewtec` stays open on purpose.

### Import and switch on

```bash
docker compose up -d
docker cp n8n_export n8n:/tmp/export
docker exec n8n n8n import:credentials --separate --input=/tmp/export/credentials
docker exec n8n n8n import:workflow --separate --input=/tmp/export/workflows
docker compose restart n8n
```

Then:
1. Create the owner account and open one credential to prove the key matches.
2. Replace `localhost:5678` and the trycloudflare address with the new hostname (workflow 8 Workday URL, workflow 1 assistant link).
3. Add `https://<host>/rest/oauth2-credential/callback` as a redirect URI in Google Cloud and reconnect Gmail.
4. Activate the request workflows (3, 5, 9 to 13) first and test them.

### Switching over
Both copies share Supabase, Gmail and Discord. Never run the scheduled workflows (2, 4, 7, 8) on both, or hires are synced twice and e-mails go out twice.

1. Deactivate 2, 4, 7 and 8 on the old machine.
2. Activate them on the server.
3. Point the website link and the welcome e-mail to the server.

### Monitoring on the server
Add Prometheus and Grafana from `monitoring/` to the same compose file, change the Prometheus target to `n8n:5678`, and publish Grafana only on `127.0.0.1:3001`. Open it through an SSH tunnel: `ssh -L 3001:localhost:3001 root@<server-ip>`.

### Backups
Server backups from the provider, or a nightly `tar` of the `n8n_data` volume. Supabase has its own daily backups.

## 3. Future improvements for a real company deployment

| Area | Improvement | Starting point today |
|---|---|---|
| Real HR system | Connect the real Workday tenant through an integration user, approved by IT | The mock already uses the real report address and a token |
| Works council and data protection | Works council agreement, DPIA and contracts with the AI providers | The AI decides nothing about people, every payroll view is logged |
| AI in the EU | Move to EU-hosted or self-hosted models | ID numbers are removed before anything reaches the AI |
| AI quality over time | Run the tests automatically after every model or prompt change | 39 automated tests and a weekly quality check |
| Policy content | An owner and a review date for every policy, in German and English | Hand-offs show which questions have no document yet |
| Running it | On-call, backups, an upgrade plan and a cost budget | Error alerts, Grafana and documented setup |

## 4. Next steps for production

- Company single sign-on (for example Cloudflare Access or Entra ID) in front of the website and portals instead of Basic Auth.
- Real Workday tenant through an integration system user.
- Paid AI tier with a fallback model.
- Queue mode with Redis and workers if the number of hires grows.
