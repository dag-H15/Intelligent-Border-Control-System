# Intelligent Border Control System

This project is an intelligent border control system that combines a React frontend, a Node.js/TypeScript backend, a Prisma database layer, and an AI service for analysis.

## Project Structure

- client/: React + Vite frontend
- server/: Node.js/TypeScript backend with Prisma
- AI-service/: Python service for AI-related processing
- database/: database-related assets
- datasets/: training or sample datasets
- docs/: project documentation

## Requirements

- Node.js and npm
- Python 3
- PostgreSQL 

## Setup

### Frontend

```bash
cd client
npm install
npm run dev
```

### Backend

```bash
cd server
npm install
npx prisma generate
```

### AI Service

```bash
cd AI-service
python -m venv .venv
source .venv/bin/activate   # On Windows use .venv\Scripts\activate
pip install -r requirements.txt
```

## Notes

- Make sure to configure environment variables before running the backend or database-related services.
- The project is still under development and may evolve as the architecture is finalized.
