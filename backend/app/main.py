from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .api.routes import router as main_router
from .api.claude_routes import router as claude_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

app = FastAPI(title="CoCo Collaborative Drawing API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(main_router)
app.include_router(claude_router)

@app.get("/")
async def root():
    return {"message": "Welcome to CoCo Collaborative Drawing API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"} 