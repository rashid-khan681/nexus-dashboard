# Nexus Prime Dashboard

A real-time, 3-tier infrastructure telemetry dashboard built to visualize network topology, compute allocation, and socket connections with microsecond latency.

## Core Problem Solved
Modern distributed systems lack unified, real-time observability. Nexus Prime bridges this gap by providing an instantaneous, WebSocket-driven dashboard that monitors live server health, network routing efficiency, and compute loads. It integrates an AI analysis engine to proactively verify system efficiency and optimal network routing without manual intervention.

## Key Features
- Real-Time Telemetry: Bi-directional WebSocket streaming for zero-refresh DOM updates.
- AI-Driven Diagnostics: Automated system health and routing analysis using Google Gemini.
- Persistent State Management: PostgreSQL integration for reliable data tier storage.
- Production-Ready Architecture: Designed for multi-stage containerization and cloud deployment.

## System Architecture
- Presentation Tier (Frontend): Next.js and React operating on Node.js.
- Application Tier (Backend): Node.js server utilizing Socket.io for live data streaming and LangChain for AI model orchestration.
- Data Tier (Database): PostgreSQL for state persistence and structured telemetry logs.

## Prerequisites
- Node.js v20.0.0 or higher
- PostgreSQL v15.0 or higher
- Google Gemini API Key

## Local Development Setup
1. Clone the repository.
2. Set up environment variables in a root `.env` file:
   `GEMINI_API_KEY=your_key_here`
   `DATABASE_URL=postgresql://user:password@localhost:5432/nexus_db`
3. Run `npm install` and start development servers in both `/frontend` (port 3000) and `/backend` (port 5001).

## Production Deployment (Containerization)
This repository contains the application source code. To deploy this on cloud infrastructure (e.g., AWS EC2), you must orchestrate the containers yourself:
1. Create a `docker-compose.yml` to define the frontend, backend, and postgres services.
2. Write multi-stage `Dockerfile`s for both Node.js applications using a minimal base image (e.g., `node:20-alpine`) to optimize deployment size.
3. Ensure the backend's `DATABASE_URL` points to the Postgres container's internal Docker hostname, not localhost.