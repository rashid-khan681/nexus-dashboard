# Nexus Prime: DevOps Journey (idea to deployment)

> Fill each section while you work. Every "Screenshot" line is a picture you must capture. Save images in `docs/screenshots/` and use names like `01-dashboard-live.png`.
> Write only what you actually did. Judges value honest notes ("this failed, here is the fix") more than a perfect story.

## 1. Idea and problem
- Problem: alert fatigue for small teams running payment / e-commerce services.
- Why existing dashboards fail: repeated alerts for the same incident.
- Screenshot: the Alerts tab with the "N breaches merged into M alerts" banner.

## 2. Architecture
- Paste the Mermaid diagram from the README (or a screenshot of it rendered on GitHub).
- Explain each box in one sentence: nginx, Next.js, Node.js backend, PostgreSQL, optional Gemini.

## 3. Rebuilding it honestly (what I changed and why)
- First version had simulated data. Rebuilt with real measurements. List what was fake before and what is measured now.
- Screenshot: System tab ("what is and isn't measured").

## 4. Local development
- Commands used, `.env` setup, port 5000 conflict on macOS (AirPlay Receiver) and how it was solved.
- Screenshot: terminal showing the backend started and the dashboard live.

## 5. Containerisation
- Backend Dockerfile: multi-stage, non-root user, healthcheck.
- Frontend Dockerfile: 3 stages, Next.js standalone output, non-root user, healthcheck.
- Bug found and fixed: Postgres volume mounted the wrong path and silently lost data on recreate.
- Screenshot: `docker images` (sizes) and `docker compose ps` showing healthy containers.

## 6. Docker Compose and nginx
- Why one entry point: single origin, no CORS, WebSockets on the same port, what Beanstalk expects.
- Show `nginx/nginx.conf` routing table: `/`, `/api`, `/health`, `/socket.io`.
- Screenshot: app running at `http://localhost:8080`.

## 7. Image registry
- Built with `linux/amd64` because the laptop is Apple silicon and EC2 is x86 (otherwise `exec format error`).
- Screenshot: the two repositories on Docker Hub with their tags.

## 8. Deployment on AWS Elastic Beanstalk
- Platform: Docker on Amazon Linux 2023, single instance (keeps WebSocket connections on one server), `t3.small` (micro runs out of memory with Compose apps).
- Steps with screenshots: create application, upload `nexus-eb.zip`, IAM roles (instance profile + service role), environment properties, health turning Green.
- Environment properties used (names only, never values): `POSTGRES_PASSWORD`, `ADMIN_TOKEN`, optional `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Screenshot: Beanstalk environment page (Health: Ok) and the dashboard on the Beanstalk URL.
- Cost control: environment terminated after recording. Screenshot: terminated state.

## 9. CI with GitHub Actions
- What the workflow checks: backend syntax, frontend production build, compose validation and image builds.
- Screenshot: a green run in the Actions tab.

## 10. Reliability testing
- Stopped the database on purpose: the app raised a "Database unreachable" alert and recovered without crashing.
- Generated CPU load: alert opened after 3 samples, escalated, resolved after 5 good samples.
- Screenshot: incident drawer with the evidence table.

## 11. Problems I hit and how I solved them
| Problem | Cause | Fix |
|---|---|---|
| (example) Port 5000 busy on Mac | AirPlay Receiver | Run backend on 5001 locally |
| (example) File names with wrong case | macOS is case-insensitive, Linux is not | Renamed with a two-step `git mv` |
| (add yours) | | |

## 12. What I would do next
- External endpoint checks, automated deploy from GitHub Actions, tests, multi-host agents.
