from typing import Dict, Optional

from fastapi import Header, HTTPException

from services.ai_services import AIServices

_user_ai_services_cache: Dict[int, AIServices | None] = {}


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail={
                "type": "auth_error",
                "message": "Authorization header is required",
                "missing_fields": ["authorization"],
            },
        )

    try:
        if authorization.startswith("Bearer "):
            user_id_str = authorization.split(" ")[1]
            user_id = int(user_id_str)
            if user_id <= 0:
                raise ValueError("User ID must be positive")
            return user_id
        raise ValueError("Invalid authorization format")
    except (ValueError, IndexError) as e:
        raise HTTPException(
            status_code=401,
            detail={
                "type": "auth_error",
                "message": f"Invalid authorization format. Expected 'Bearer <user_id>', got: {authorization[:50]}...",
                "error_details": str(e),
            },
        )


def get_user_ai_services(user_id: int) -> AIServices | None:
    if user_id not in _user_ai_services_cache:
        try:
            _user_ai_services_cache[user_id] = AIServices(user_id=user_id)
        except Exception as e:
            print(f"Warning: Failed to create AI services for user {user_id}: {e}")
            _user_ai_services_cache[user_id] = None

    return _user_ai_services_cache[user_id]


def clear_user_ai_services_cache(user_id: int) -> None:
    if user_id in _user_ai_services_cache:
        del _user_ai_services_cache[user_id]

