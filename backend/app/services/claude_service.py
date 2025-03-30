import os
import json
import asyncio
import aiohttp
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class ClaudeService:
    """Service for interacting with Anthropic's Claude API"""
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            logger.error("ANTHROPIC_API_KEY not found in environment variables")
            raise ValueError("ANTHROPIC_API_KEY not found in environment variables")
        
        self.base_url = "https://api.anthropic.com/v1/messages"
        self.headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
    async def generate_drawing_improvements(self, drawing_data: str, prompt: str) -> Dict[str, Any]:
        """
        Generate improvements or suggestions for a drawing using Claude
        
        Args:
            drawing_data: Base64 encoded drawing data or drawing description
            prompt: Additional instructions or context for improvement
            
        Returns:
            Dictionary containing Claude's response and any generated improvements
        """
        try:
            request_data = {
                "model": "claude-3-opus-20240229",
                "max_tokens": 4000,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text", 
                                "text": f"I have a drawing that I'd like you to help improve. Here's the drawing data or description:\n\n{drawing_data}\n\nPlease provide suggestions and improvements based on this context:\n{prompt}"
                            }
                        ]
                    }
                ]
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.base_url,
                    headers=self.headers,
                    json=request_data
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Claude API request failed: {response.status} - {error_text}")
                        return {"error": f"API request failed with status {response.status}", "details": error_text}
                    
                    result = await response.json()
                    return {
                        "improved_drawing": result.get("content", [{}])[0].get("text", ""),
                        "raw_response": result
                    }
                    
        except Exception as e:
            logger.exception(f"Error calling Claude API: {str(e)}")
            return {"error": f"Error calling Claude API: {str(e)}"}
    
    async def get_drawing_feedback(self, drawing_data: str) -> Dict[str, Any]:
        """
        Get feedback on a drawing using Claude
        
        Args:
            drawing_data: Base64 encoded drawing data or drawing description
            
        Returns:
            Dictionary containing Claude's feedback
        """
        try:
            request_data = {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text", 
                                "text": f"I'd like you to analyze this drawing and give me constructive feedback on how to improve it. Be specific and helpful.\n\nDrawing data:\n{drawing_data}"
                            }
                        ]
                    }
                ]
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.base_url,
                    headers=self.headers,
                    json=request_data
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Claude API request failed: {response.status} - {error_text}")
                        return {"error": f"API request failed with status {response.status}", "details": error_text}
                    
                    result = await response.json()
                    return {
                        "feedback": result.get("content", [{}])[0].get("text", ""),
                        "raw_response": result
                    }
                    
        except Exception as e:
            logger.exception(f"Error calling Claude API: {str(e)}")
            return {"error": f"Error calling Claude API: {str(e)}"}
    
    async def enhance_collaboration(self, user_actions: List[Dict], drawing_data: str) -> Dict[str, Any]:
        """
        Get AI-enhanced collaboration suggestions based on user actions
        
        Args:
            user_actions: List of user actions and activities
            drawing_data: Current state of the drawing
            
        Returns:
            Dictionary containing Claude's collaboration suggestions
        """
        try:
            actions_json = json.dumps(user_actions)
            
            request_data = {
                "model": "claude-3-sonnet-20240229",
                "max_tokens": 2000,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text", 
                                "text": f"I'm working on a collaborative drawing with others. Based on our actions and the current drawing, can you suggest ways we could better collaborate or improve our drawing?\n\nUser Actions:\n{actions_json}\n\nCurrent Drawing State:\n{drawing_data}\n\nPlease provide specific collaboration suggestions and drawing improvement ideas."
                            }
                        ]
                    }
                ]
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.base_url,
                    headers=self.headers,
                    json=request_data
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Claude API request failed: {response.status} - {error_text}")
                        return {"error": f"API request failed with status {response.status}", "details": error_text}
                    
                    result = await response.json()
                    return {
                        "collaboration_suggestions": result.get("content", [{}])[0].get("text", ""),
                        "raw_response": result
                    }
                    
        except Exception as e:
            logger.exception(f"Error calling Claude API: {str(e)}")
            return {"error": f"Error calling Claude API: {str(e)}"} 