# Terminas: Cloud Collaboration IDE Sandbox

Terminas is a cloud-based development playground featuring a unified reverse proxy, real-time multi-user Monaco editor syncing via Yjs, integrated PTY console terminals, and sandboxed Docker resource boundaries.

---

## Startup Guide

Follow this step-by-step order to build and run all services locally.

### 1. Boot the Database
Terminas uses PostgreSQL for configurations and user profiles. We have configured a Docker Compose file to bootstrap this immediately.

From the root project folder:
```bash
docker compose up -d
```
*This starts a PostgreSQL instance on port `5432` matching the credentials defined in the backend environment variables (`user=postgres password=postgres dbname=terminas`).*

---

### 2. Compile the Container Agent
The orchestrator backend spawns developer sandbox environments dynamically. You must compile the base agent Docker image so that the orchestrator can instantiate them.

From the root project folder:
```bash
docker build -t terminas-agent:latest ./agent
```

---

### 3. Run the Go Orchestrator Backend
1. Ensure your local environment variables in `backend/.env` are correctly set up (we have generated a default `.env` file for you).
2. Go into the backend directory and run:
```bash
cd backend
go run main.go
```
*On launch, GORM will connect to the PostgreSQL instance and automatically run schema migrations to create the user, container, and template tables.*

---

### 4. Run the React Frontend
1. Navigate to the frontend directory.
2. Install package dependencies:
```bash
cd frontend
npm install
```
3. Launch the development server:
```bash
npm run dev
```

Open your browser at [http://localhost:5173](http://localhost:5173) to create your developer profile and boot your sandboxed workspace environments!
