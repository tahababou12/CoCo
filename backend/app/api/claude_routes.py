from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import asyncio
import logging

from ..services.claude_service import ClaudeService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/claude", tags=["claude"])

class DrawingImprovementRequest(BaseModel):
    drawing_data: str
    prompt: str = "Improve this drawing with more details and better technique."

class FeedbackRequest(BaseModel):
    drawing_data: str

class CollaborationRequest(BaseModel):
    user_actions: List[Dict[str, Any]]
    drawing_data: str

# Create a singleton instance of the Claude service
claude_service = ClaudeService()

@router.post("/improve")
async def improve_drawing(request: DrawingImprovementRequest):
    """
    Get Claude-powered improvements for a drawing
    """
    try:
        result = await claude_service.generate_drawing_improvements(
            request.drawing_data, 
            request.prompt
        )
        
        if "error" in result:
            logger.error(f"Error improving drawing: {result['error']}")
            raise HTTPException(status_code=500, detail=result["error"])
            
        return JSONResponse(content=result)
    
    except Exception as e:
        logger.exception(f"Error in improve_drawing endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/feedback")
async def get_drawing_feedback(request: FeedbackRequest):
    """
    Get Claude-powered feedback on a drawing
    """
    try:
        result = await claude_service.get_drawing_feedback(request.drawing_data)
        
        if "error" in result:
            logger.error(f"Error getting feedback: {result['error']}")
            raise HTTPException(status_code=500, detail=result["error"])
            
        return JSONResponse(content=result)
    
    except Exception as e:
        logger.exception(f"Error in get_drawing_feedback endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collaboration")
async def enhance_collaboration(request: CollaborationRequest):
    """
    Get Claude-powered collaboration suggestions
    """
    try:
        result = await claude_service.enhance_collaboration(
            request.user_actions,
            request.drawing_data
        )
        
        if "error" in result:
            logger.error(f"Error enhancing collaboration: {result['error']}")
            raise HTTPException(status_code=500, detail=result["error"])
            
        return JSONResponse(content=result)
    
    except Exception as e:
        logger.exception(f"Error in enhance_collaboration endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 