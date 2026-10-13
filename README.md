# DevOps Learning Project: GitHub → Jenkins → PM2 (+ Docker, Nginx, Prometheus, Grafana)

A small but realistic full-stack app (React frontend + Node/Express API) with a complete
CI/CD pipeline and monitoring, spread over two machines.

```
 Developer ──push──▶ GitHub ──webhook──▶ SERVER 1: Jenkins (Docker)
                                            │  test → build → package → ssh deploy
                                            ▼
                               SERVER 2: Deployment server
                               ├─ Nginx :80  ──▶ /     → PM2 "frontend" :8080
                               │                └▶ /api → PM2 "backend" ×2 (cluster) :3000
                               └─ Docker: Prometheus :9090, Grafana :3001,
                                          node-exporter :9100, cAdvisor :8081
```

| Server | Role | Runs |
|---|---|---|
| Server 1 (Jenkins) | CI/CD | Jenkins in Docker (with Node 20 + Docker CLI) |
| Server 2 (Deploy)  | Runtime + monitoring | Nginx, PM2 (backend + frontend), Docker monitoring stack |

## Repo layout

```
backend/            Express API (+ /metrics for Prometheus), tests, Dockerfile
frontend/           React (Vite) app
Jenkinsfile         Pipeline definition
ecosystem.config.js PM2 apps (backend cluster x2, frontend static server)
nginx/              Reverse proxy config
jenkins/            Dockerfile + compose for Jenkins server
monitoring/         Prometheus, alert rules, Grafana provisioning, compose
scripts/            setup-jenkins-server.sh, setup-deploy-server.sh, deploy.sh
docker-compose.yml  Local dev only
```

## Step 0: Put the project on GitHub

```bash
cd devops-project
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/devops-project.git
git push -u origin main
```

Before pushing, run `npm install` once in `backend/` and `frontend/` and commit the generated
`package-lock.json` files. The pipeline uses `npm ci`, which requires them.

## Step 1: Set up Server 1 (Jenkins)

```bash
git clone https://github.com/<you>/devops-project.git && cd devops-project
sudo bash scripts/setup-jenkins-server.sh
```

The script installs Docker, builds and starts Jenkins, and prints two things you need:
the **public SSH key** (for Server 2) and the **initial admin password**.

Open `http://<jenkins-ip>:8080`, paste the password, choose "Install suggested plugins", and
create your admin user. (The plugins the Jenkinsfile needs are already baked into the image.)

## Step 2: Set up Server 2 (deployment)

```bash
git clone https://github.com/<you>/devops-project.git && cd devops-project
sudo bash scripts/setup-deploy-server.sh "<paste the Jenkins public key here>"
sudo cp scripts/deploy.sh /opt/devops-app/deploy.sh
sudo chown deploy:deploy /opt/devops-app/deploy.sh
```

This installs Node 20, Docker, Nginx and PM2, creates a `deploy` user that only Jenkins' key
can log into, enables PM2 on boot, and opens the firewall.

Check from Server 1 that Jenkins can reach it:

```bash
docker exec -it jenkins ssh -i /var/jenkins_home/.ssh/deploy_key -o StrictHostKeyChecking=accept-new deploy@<deploy-ip> "echo connected"
```

## Step 3: Connect Jenkins to GitHub and Server 2

1. **Deploy key credential**: Manage Jenkins → Credentials → Global → Add →
   *SSH Username with private key*. ID `deploy-ssh-key`, username `deploy`, enter the private key
   directly (get it with `docker exec jenkins cat /var/jenkins_home/.ssh/deploy_key`).
2. **GitHub access** (needed for a private repo): add a second credential (a GitHub personal
   access token as "Username with password") or a deploy key.
3. Edit the `Jenkinsfile`: set `DEPLOY_HOST` to Server 2's IP, then commit and push.
4. **Create the job**: New Item → *Pipeline* → "Pipeline script from SCM" → Git → your repo URL →
   branch `*/main` → Script Path `Jenkinsfile`.
5. **Webhook**: GitHub repo → Settings → Webhooks → Add. Payload URL
   `http://<jenkins-ip>:8080/github-webhook/`, content type `application/json`, "Just the push
   event". GitHub must be able to reach Jenkins. If Jenkins is on a private network, enable
   "Poll SCM" (`H/2 * * * *`) in the job instead.

## Step 4: First deploy

Click **Build Now** in Jenkins (or push a commit). Pipeline stages:
Checkout → Backend tests → Frontend build → Docker image check → Package → Deploy → Smoke test.

On Server 2, `deploy.sh` unpacks into `/opt/devops-app/releases/<build>`, flips the `current`
symlink, runs `pm2 startOrReload` (zero-downtime cluster reload), health-checks the API, and
**rolls back automatically** if the check fails. Only the last 5 releases are kept.

Verify:

```bash
curl http://<deploy-ip>/api/health      # {"status":"ok",...}
open http://<deploy-ip>/                # the React app
pm2 status                              # as the deploy user: backend x2, frontend
```

## Step 5: Monitoring

On Server 2:

```bash
cd monitoring
GRAFANA_PASSWORD='choose-a-strong-one' docker compose up -d
```

- Prometheus: `http://<deploy-ip>:9090` (Status → Targets: all four should be UP)
- Grafana: `http://<deploy-ip>:3001` (user `admin`). The Prometheus datasource is pre-wired.
  Import ready-made dashboards via Dashboards → New → Import:
  - **1860**: Node Exporter Full (host CPU/RAM/disk/network)
  - **14282**: cAdvisor (container metrics)
- Your API's own metrics (`http_request_duration_seconds`, plus Node.js runtime metrics) are
  scraped from `:3000/metrics`. Try the query
  `sum(rate(http_request_duration_seconds_count[1m])) by (route)` in Prometheus.
- Alert rules in `monitoring/alerts.yml` (target down, CPU, memory, disk, p95 latency, 5xx) show
  under Prometheus → Alerts. To get notifications, add Alertmanager next (a good follow-up exercise).

## Day-to-day commands

```bash
pm2 status | pm2 logs backend | pm2 monit        # runtime
pm2 reload ecosystem.config.js                    # manual zero-downtime reload
ls /opt/devops-app/releases                       # release history
ln -sfn /opt/devops-app/releases/<n> /opt/devops-app/current && pm2 reload ecosystem.config.js  # manual rollback
docker compose -f monitoring/docker-compose.yml logs -f prometheus
```

## Local development

```bash
docker compose up --build        # backend :3000, frontend :5173
# or without Docker:
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Jenkins "Permission denied (publickey)" | Public key in `/home/deploy/.ssh/authorized_keys` on Server 2? Credential ID is exactly `deploy-ssh-key`? |
| `docker: permission denied` in a Jenkins build | Jenkins container must mount `/var/run/docker.sock` (compose does this) |
| Deploy stage skipped | The Deploy stage only runs for the `main` branch (`GIT_BRANCH`) |
| `pm2: command not found` over SSH | Non-interactive shells have a short PATH: `sudo ln -s $(which pm2) /usr/local/bin/pm2` |
| Prometheus target `backend` DOWN | Backend running? `curl localhost:3000/metrics` on Server 2. Container uses `host.docker.internal` (needs Docker 20.10+) |
| Port not reachable from your laptop | `sudo ufw status` on Server 2, and any network firewall in between |
| Jenkins can't reach GitHub webhook | Use Poll SCM instead, or expose Jenkins via a reverse proxy / tunnel |

## Hardening and next steps (good exercises)

1. HTTPS with Let's Encrypt (Certbot + Nginx), and a domain name.
2. Run Jenkins as a non-root user and use a Docker agent instead of mounting the host socket.
3. Add Alertmanager with Slack or Teams notifications. Notify on build failure from Jenkins too.
4. Replace the in-memory data with PostgreSQL in Docker and add a migration step to the pipeline.
5. Add linting and a coverage gate to the pipeline, and a staging environment before production.
6. Centralized logs with Loki + Promtail in the Grafana stack.
7. Back up `jenkins_home` regularly.
