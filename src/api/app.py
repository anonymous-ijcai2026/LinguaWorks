import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from infrastructure.config import get_config

from api.routers.meta import router as meta_router
from api.routers.system_testing import router as system_testing_router
from api.routers.versions import router as versions_router
from api.routers.workflow import router as workflow_router

config = get_config()

app = FastAPI(
    title="LinguaWorks", description="A prompt optimization system for conversations"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workflow_router)
app.include_router(system_testing_router)
app.include_router(meta_router)
app.include_router(versions_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=config.fastapi_port)
