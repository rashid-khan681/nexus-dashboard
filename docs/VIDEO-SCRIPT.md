# Walkthrough video: script (target 6 to 6.5 minutes, hard limit 7)

Format: face cam + screen share, 1080p. Free tools: OBS Studio, Loom, or Zoom (record to computer). Record in a quiet room, close notifications, zoom the browser to 110%.

## Before recording
1. Have the app running (local Docker or Beanstalk) and at least one alert already visible, so the Alerts tab is not empty.
2. Prepare a CPU load for the live demo (run it for ~60 seconds when you reach that part):
   `for i in 1 2 3 4 5 6 7 8; do (timeout 60 yes > /dev/null &); done`
   This registers when the backend runs directly on your Mac (`node backend/server.js`). If you demo through Docker Desktop, test it once first.
3. Open these tabs in order: README on GitHub, dashboard, Docker Hub, Beanstalk console, GitHub Actions run.
4. Do one full dry run with a timer.

## Timeline
| Time | Section | Show on screen | Say (in your own words) |
|---|---|---|---|
| 0:00-0:40 | Idea | Face cam + README top | Name, the problem (alert fatigue for small teams on payment / e-commerce services), what Nexus Prime does in one sentence |
| 0:40-3:10 | Application screens | Dashboard tabs: Overview, Alerts, Events, System | KPI strip and ping gauge (real values). Start the CPU load: alert opens after 3 samples, then escalates. Open the incident drawer: evidence table and the analysis with its honest source label. Show the "breaches merged into alerts" banner. System tab: what is and is not measured |
| 3:10-3:50 | Tech used | README tech table / architecture diagram | Next.js, Node.js, Socket.IO, PostgreSQL, Gemini (optional), nginx, Docker, Beanstalk, GitHub Actions |
| 3:50-5:30 | Deployment strategy + DevOps | Repo files, Docker Hub, Beanstalk console, Actions | Multi-stage non-root Docker images, nginx single entry point, Compose, amd64 images to Docker Hub, Beanstalk single instance with t3.small, environment properties for secrets, CI that builds everything, bugs found (Postgres volume, file-name case, arm64 vs amd64) |
| 5:30-6:15 | What's next | Roadmap in README | External endpoint checks, auto-deploy, tests, multi-host agents. One honest limitation: single host today |
| 6:15-6:30 | Close | Face cam | Thank Shubham Londhe and the community |

## Tips
- Speak slowly. Say "this is measured, not simulated" when you show real numbers.
- Do not read the screen. Do not hide limitations: honesty is your strongest point.
- Upload as a file or an unlisted YouTube link, depending on what the form asks.
