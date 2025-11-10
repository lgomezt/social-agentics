import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from .routes import calendar, recommendations


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

load_dotenv()


def create_app() -> FastAPI:
    logger.info("Creating FastAPI application")
    app = FastAPI(
        title="Social Agentics API",
        version="0.1.0",
        description="Backend services for calendar availability and agents.",
    )

    app.include_router(calendar.router, prefix="/api/availability", tags=["availability"])
    app.include_router(
        recommendations.router,
        prefix="/api/recommendations",
        tags=["recommendations"],
    )
    logger.info("Application ready with routers registered")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    logger.info("Starting uvicorn server on 0.0.0.0:8000")
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )