# Election Management System — Complete Setup & Run Guide
### For First-Time Setup (Never Run Before)

> Run every command in order. Do not skip steps.  
> All commands assume macOS and the terminal app (zsh/bash).

---

## PART 0 — Install Required Tools

Skip any tool you already have (check with the commands shown).

### 0.1 · Homebrew (macOS package manager)

```bash
# Check if installed
brew --version

# Install if missing
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 0.2 · Node.js (v20+)

```bash
# Check
node --version   # needs to say v20.x.x or higher
npm --version

# Install via Homebrew
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 0.3 · Python 3.11+

```bash
# Check
python3 --version   # needs 3.11+

# Install via Homebrew
brew install python@3.11
echo 'export PATH="/opt/homebrew/opt/python@3.11/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 0.4 · Docker Desktop

1. Download from: https://www.docker.com/products/docker-desktop/
2. Install the `.dmg` and open Docker Desktop
3. Wait for it to fully start (whale icon stops animating in menu bar)

```bash
# Verify
docker --version          # needs 24.0+
docker compose version    # needs 2.20+
```

### 0.5 · Git

```bash
# Usually pre-installed on Mac, check:
git --version

# Install if missing
brew install git
```

---

## PART 1 — Get the Project

```bash
# Clone the repo
git clone https://github.com/navyaaasingh/ElectionManagement.git
cd ElectionManagement
```

> All subsequent commands assume you are inside the `ElectionManagement/` folder
> unless told otherwise.

---

## PART 2 — Environment Configuration

```bash
# Copy the example env file
cp .env.example .env

# Open it to edit
open -e .env        # opens in TextEdit
# OR use VS Code:  code .env
```

**Minimum changes you MUST make** (find and replace these values):

```
JWT_SECRET=put_any_long_random_string_here_at_least_32_chars
POSTGRES_PASSWORD=pick_a_db_password
MONGODB_PASSWORD=pick_a_mongo_password
REDIS_PASSWORD=pick_a_redis_password
AES_ENCRYPTION_KEY=exactly_32_characters_long_key!
```

Everything else can stay as-is for development.

---

## PART 3 — Start Infrastructure (Docker)

This starts the databases and message broker that everything else depends on.

```bash
# Start PostgreSQL, MongoDB, Redis, MQTT broker
docker compose up -d postgres mongodb redis mqtt-broker
```

Wait about 20 seconds, then check all are healthy:

```bash
docker compose ps
```

You should see `healthy` or `running` next to each service. If any shows `starting`, wait 10 more seconds and check again.

**Expected output:**
```
NAME                  STATUS
election-grafana      running (healthy)
election-mongodb      running (healthy)
election-mqtt         running (healthy)
election-postgres     running (healthy)
election-prometheus   running (healthy)
election-redis        running (healthy)
```

### Verify the database initialized

```bash
docker compose exec postgres psql -U election_admin -d election_db -c "\dt"
```

You should see exactly **10 tables**:
*   `admin_users`, `audit_logs`, `candidates`, `districts`, `elections`
*   `fraud_alerts`, `iot_terminals`, `system_config`, `voters`, `voting_records`

---

## PART 4 — Backend API

### 4.1 · Install dependencies

```bash
cd backend
npm install
```

This installs: `express`, `sequelize`, `mongoose`, `jsonwebtoken`, `fabric-network`, `mqtt`, `ws`, `bcryptjs`, `helmet`, `winston`, `nodemon`, and more (~38 packages).

### 4.2 · Run database migrations

```bash
npm run db:migrate
```

### 4.3 · Start the backend

```bash
npm run dev
```

You should see:
```
[nodemon] starting `node src/server.js`
Server running on port 3000
PostgreSQL connected
MongoDB connected
```

### 4.4 · Verify it works

Open a new terminal tab and run:

```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{"status":"healthy","service":"election-management-api","version":"1.0.0"}
```

> Keep this terminal running. Open new tabs for the next steps.

---

## PART 5 — Unified Frontend, ML Service & IoT Terminal

### 5.1 · ElectionOS (Frontend)

```bash
# New terminal tab
cd ElectionManagement/frontend
npm install
npm run dev
```

This project uses: `react`, `react-router-dom`, `vite`, `lucide-react`, `chart.js`.

**Access the Portals:**
Open your browser to: **http://localhost:3001**
* **Voter UI**: `http://localhost:3001/voter`
* **Admin Portal**: `http://localhost:3001/admin`
* **Observer Dashboard**: `http://localhost:3001/results`
* **Verification Portal**: `http://localhost:3001/verify`

### 5.2 · ML Fraud Detection Service

```bash
# New terminal tab
cd ElectionManagement/ml-service

# Create a Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install packages
pip install -r requirements.txt

# Start the service
python api.py
```

Service runs on: **http://localhost:5000**
> Run `deactivate` to exit the Python virtual environment when done.

### 5.3 · IoT Terminal (If You Have the Hardware)

```bash
cd ElectionManagement/iot-terminal

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install pyserial paho-mqtt python-dotenv
```

**Configure the terminal:**
Edit `config.json`:
```json
{
  "terminal_id": "TERMINAL_001",
  "district_id": "DISTRICT_01",
  "mqtt": { "broker": "localhost", "port": 1883 },
  "sensor": { "port": "/dev/tty.usbserial-0001", "baud_rate": 57600 }
}
```

```bash
# Run full terminal
python src/terminal_main.py
```

---

## PART 6 — Election Simulation (No Hardware Needed)

Use this to generate fake voters and votes for testing — no physical hardware required.

```bash
cd ElectionManagement/scripts/simulation

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run a small 100-voter simulation
python simulate-election.py --scenario small
```

---

## PART 7 — Test the Full API Flow

With the backend running, try this sequence of curl commands:

### Step 1: Login

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python3 -m json.tool
```

Copy the `token` value from the response.

### Step 2: Create an Election

```bash
curl -s -X POST http://localhost:3000/api/v1/elections \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "electionName": "Test Election 2026",
    "electionType": "local",
    "startDate": "2027-01-01T08:00:00Z",
    "endDate": "2027-01-01T18:00:00Z"
  }' | python3 -m json.tool
```

Copy the `election_id` from the response.

### Step 3: Add a Candidate

```bash
curl -s -X POST http://localhost:3000/api/v1/candidates \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "electionId": "YOUR_ELECTION_ID_HERE",
    "fullName": "Candidate One",
    "partyName": "Party A",
    "partySymbol": "🌟",
    "districtId": "district-01"
  }' | python3 -m json.tool
```

### Step 4: List All Elections

```bash
curl -s http://localhost:3000/api/v1/elections | python3 -m json.tool
```

### Step 5: Get Results

```bash
curl -s http://localhost:3000/api/v1/results/YOUR_ELECTION_ID | python3 -m json.tool
```

---

## QUICK REFERENCE: All Services

| What | Command | URL |
|------|---------|-----|
| Start infra (DBs + MQTT) | `docker compose up -d postgres mongodb redis mqtt-broker` | — |
| Backend API | `cd backend && npm run dev` | http://localhost:3000/api/v1 |
| ElectionOS (Frontend) | `cd frontend && npm run dev` | http://localhost:3001 |
| ML Service | `cd ml-service && source venv/bin/activate && python api.py` | http://localhost:5000 |
| Simulation | `cd scripts/simulation && source venv/bin/activate && python simulate-election.py --scenario small` | — |

---

## QUICK REFERENCE: All Ports

| Port | Service |
|------|---------|
| 3000 | Backend API |
| 3001 | ElectionOS (Frontend) |
| 5000 | ML Service |
| 5432 | PostgreSQL |
| 27017 | MongoDB |
| 6379 | Redis |
| 1883 | MQTT |
| 9090 | Prometheus |
| 3004 | Grafana |

---

## Common Errors & Fixes

### "ECONNREFUSED" on backend start
→ Databases not running yet. Run `docker compose up -d postgres mongodb redis` first.

### "Cannot find module" on `npm run dev`
→ Dependencies not installed. Run `npm install` in that folder first.

### "port already in use"
```bash
# Find and kill what's using port 3000
lsof -i :3000
kill -9 <PID>
```

### Docker containers show "starting" forever
```bash
docker compose logs postgres   # check for error messages
docker compose restart postgres
```

### Python: "No module named X"
→ Your virtual environment is not activated. Run `source venv/bin/activate` in the relevant folder.

### `psql: FATAL: role "election_admin" does not exist`
→ Database didn't initialize with schema. Run:
```bash
docker compose down -v          # removes volumes
docker compose up -d postgres   # recreates and runs schema
```

---

## Stop Everything

```bash
# Stop just infra (data is saved)
docker compose down

# Stop AND delete all data (fresh start)
docker compose down -v

# Kill a local dev server: press Ctrl+C in its terminal tab
```
