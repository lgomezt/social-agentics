## Tech Stack Summary
It's a full-stack project using React/Vite for the frontend and Python/FastAPI for the backend. Everything is containerized with Docker and set up for development in `docker-compose.dev.yml`.

## Run the App
From the repository root, start the full stack with Docker (recommended for consistent dev tooling):
```bash
docker compose -f docker-compose.dev.yml up --build
```
This builds and runs both containers—FastAPI inside the `backend` service and Vite inside `frontend`. 

View logs with `docker compose -f docker-compose.dev.yml logs -f backend` and use your editor’s *Attach to Docker* button to hook a debugger into the `backend` container (port `5678` is exposed for this).
