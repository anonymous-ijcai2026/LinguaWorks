from fastapi import APIRouter, Depends, HTTPException

from infrastructure.config.agent_mapping import (
    get_agent_info,
    get_all_agents,
    get_all_categories,
    get_category_agents_mapping,
)

from api.dependencies import (
    clear_user_ai_services_cache,
    get_current_user_id,
    get_user_ai_services,
)
from api.schemas import ApiResponse


router = APIRouter()


@router.get("/agent-mapping", response_model=ApiResponse)
async def get_agent_mapping():
    try:
        agents = get_all_agents()
        categories = get_all_categories()
        category_agents = get_category_agents_mapping()

        return {
            "status": "success",
            "result": {
                "agents": agents,
                "categories": categories,
                "category_agents": category_agents,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent-info/{agent_key}", response_model=ApiResponse)
async def get_agent_info_by_key(agent_key: str):
    try:
        agent_info = get_agent_info(agent_key)
        if not agent_info:
            raise HTTPException(
                status_code=404, detail=f"Agent '{agent_key}' not found"
            )

        return {"status": "success", "result": agent_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload-ai-config", response_model=ApiResponse)
async def reload_ai_config(user_id: int = Depends(get_current_user_id)):
    try:
        clear_user_ai_services_cache(user_id)

        user_ai_services_instance = get_user_ai_services(user_id)
        if user_ai_services_instance is not None:
            return {
                "status": "success",
                "result": {"reloaded": True},
                "message": "AI configuration reloaded from database",
            }
        return {
            "status": "info",
            "result": {"reloaded": False},
            "message": "No database configuration found, please configure the model settings first",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/validate-model-config", response_model=ApiResponse)
async def validate_model_config(user_id: int = Depends(get_current_user_id)):
    try:
        user_ai_services_instance = get_user_ai_services(user_id)
        if user_ai_services_instance is None:
            return {
                "status": "error",
                "message": "AI model configuration not found in database. Please configure the model settings first.",
                "result": {
                    "valid": False,
                    "message": "AI model configuration not found in database. Please configure the model settings first.",
                    "missing_fields": ["modelApiUrl", "modelApiKey", "modelName"],
                },
            }

        validation_result = user_ai_services_instance.validate_model_config()
        return {
            "status": "success" if validation_result["valid"] else "error",
            "message": validation_result["message"],
            "result": validation_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/validate-analysis-config", response_model=ApiResponse)
async def validate_analysis_config(user_id: int = Depends(get_current_user_id)):
    try:
        user_ai_services_instance = get_user_ai_services(user_id)
        if user_ai_services_instance is None:
            return {
                "status": "error",
                "message": "AI model configuration not found in database. Please configure the model settings first.",
                "result": {
                    "valid": False,
                    "message": "AI model configuration not found in database. Please configure the model settings first.",
                    "missing_fields": ["modelApiUrl", "modelApiKey", "modelName"],
                },
            }

        validation_result = user_ai_services_instance.validate_analysis_config()
        return {
            "status": "success" if validation_result["valid"] else "error",
            "message": validation_result["message"],
            "result": validation_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

