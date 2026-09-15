# Nexus Prime Dashboard

A real-time, 3-tier infrastructure telemetry dashboard built to 
visualize network topology, compute allocation, and socket connections 
with microsecond latency.

## Core Problem Solved

Modern distributed systems lack unified, real-time observability. 
Nexus Prime bridges this gap by providing an instantaneous, 
WebSocket-driven dashboard that monitors live server health, network 
routing efficiency, and compute loads. It integrates an AI analysis 
engine to proactively verify system efficiency and optimal network 
routing without manual intervention.

## Key Features

- **Real-Time Telemetry:** Bi-directional WebSocket streaming for 
  zero-refresh DOM updates.
- **AI-Driven Diagnostics:** Automated system health and routing 
  analysis using Google Gemini, orchestrated via LangChain.
- **Active-Passive DR Simulation:** Logical primary/standby node 
  architecture (ap-south-1 / ap-south-2) with automatic AI-triggered 
  failover when compute load reaches 100%.
- **Persistent State Management:** PostgreSQL integration for 
  reliable data tier storage.
- **Fully Containerized:** Multi-stage Docker builds, orchestrated 
  with Docker Compose, deployed on AWS EC2.
- **Dynamic Client Routing:** Eliminates hardcoded IPs by using `window.location.hostname` to auto-resolve WebSocket connections seamlessly across any AWS EC2 instance.

## System Architecture

- **Presentation Tier (Frontend):** Next.js and React
- **Application Tier (Backend):** Node.js server using Socket.io for 
  live data streaming and LangChain for AI model orchestration
- **Data Tier (Database):** PostgreSQL 15 for state persistence and 
  structured telemetry logs

See `nexus-architecture-diagram.png` for the full deployed architecture, 
including the Active-Passive failover flow.

## Architecture Diagram of Nexus-Dashboard
![Nexus Prime Architecture](architecture-diagram.png)

## Prerequisites (Local Development Only)

- Node.js v20.0.0 or higher
- PostgreSQL v15.0 or higher
- Google Gemini API Key
- Docker & Docker Compose (for containerized deployment)

## Local Development Setup (without Docker)

1. Clone the repository.
2. Set up environment variables in a root `.env` file:
```
   GEMINI_API_KEY=your_key_here
   DATABASE_URL=postgresql://user:password@localhost:5432/nexus_db
```
3. Run `npm install` and start development servers in both 
   `/frontend` (port 3000) and `/backend` (port 5000).

## Docker Deployment (Completed)

The application is fully containerized and deployed on AWS EC2 using 
Docker Compose.

1. Clone the repo:
```bash
   git clone https://github.com/rashid-khan681/nexus-dashboard.git
   cd nexus-dashboard
```

2. Create a `.env` file in the root directory:
```
   POSTGRES_USER=<your-value>
   POSTGRES_PASSWORD=<your-value>
   POSTGRES_DB=<your-value>
   GEMINI_API_KEY=<your-value>
   DATABASE_URL=postgresql://<user>:<password>@database:5432/<db>
```
   Note: `DATABASE_URL` uses `database` (the Docker service name) as 
   the host, not `localhost` — since the backend connects to Postgres 
   over the internal Docker network.

3. Start everything:
```bash
   docker compose up -d
```

4. Open the app:
   - Frontend: `http://<your-ec2-ip>:3000`
   - Backend API & WebSocket: `http://<your-ec2-ip>:5000`

## Finale Image Size

- **Frontend:** 299MB
- **Backend:** 391MB

## Docker Hub

Both images are available on Docker Hub:

- **Backend:** [rashidkhan6685/nexus-backend](https://hub.docker.com/r/rashidkhan6685/nexus-backend)
```bash
  docker pull rashidkhan6685/nexus-backend:v1
```
- **Frontend:** [rashidkhan6685/nexus-frontend](https://hub.docker.com/r/rashidkhan6685/nexus-frontend)
```bash
  docker pull rashidkhan6685/nexus-frontend
```

## Security & Reliability Notes

- PostgreSQL has no publicly exposed port — reachable only within the 
  internal Docker network (`nexus-net`)
- Backend only starts after the database passes its `pg_isready` 
  healthcheck (`depends_on: condition: service_healthy`)
- Telemetry data persists across restarts via a named Docker volume 
  (`pg_data`)
- Configuration loaded via `.env` file — never hardcoded

## Environment Variables Reference

| Variable | Description |
|---|---|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | PostgreSQL database name |
| `GEMINI_API_KEY` | Google Gemini API key for AI diagnostics |
| `DATABASE_URL` | Full Postgres connection string (use Docker service name `database` as host in production) |
