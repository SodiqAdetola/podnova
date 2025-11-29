# app/main.py
from fastapi import FastAPI

from app.routes import (
    user_routes,
    # topic_routes,
    # podcast_routes,
    # discussion_routes,
    # auth,  # only for explicit auth routes
)

app = FastAPI(title="PodNova Backend")


@app.get("/")
def root():
    return {"message": "Welcome to PodNova Backend!"}


# Routers
app.include_router(user_routes.router, prefix="/users", tags=["users"])
# app.include_router(topic_routes.router, prefix="/topics", tags=["topics"])
# app.include_router(podcast_routes.router, prefix="/podcasts", tags=["podcasts"])
# app.include_router(discussion_routes.router, prefix="/discussions", tags=["discussions"])
# app.include_router(auth.router, prefix="/auth", tags=["auth"])
