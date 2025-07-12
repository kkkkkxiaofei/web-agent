import requests
import json
import os
from typing import Dict, List, Any, Optional


class ChatCompletion:
    def __init__(self, response_data: Dict):
        self.choices = [Choice(choice) for choice in response_data.get("choices", [])]
        self.id = response_data.get("id")
        self.object = response_data.get("object")
        self.created = response_data.get("created")
        self.model = response_data.get("model")
        self.usage = response_data.get("usage")


class Choice:
    def __init__(self, choice_data: Dict):
        self.message = Message(choice_data.get("message", {}))
        self.index = choice_data.get("index")
        self.finish_reason = choice_data.get("finish_reason")


class Message:
    def __init__(self, message_data: Dict):
        self.content = message_data.get("content")
        self.role = message_data.get("role")


class ChatCompletions:
    def __init__(self, api_client):
        self.api_client = api_client

    def create(
        self,
        model: str,
        messages: List[Dict],
        max_tokens: int = 1000,
        temperature: float = 0.1,
        **kwargs,
    ) -> ChatCompletion:
        """Create a chat completion using the custom API"""
        return self.api_client._make_chat_request(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs,
        )


class Chat:
    def __init__(self, api_client):
        self.completions = ChatCompletions(api_client)


class CustomOpenAIClient:
    def __init__(
        self, api_key: str = None, base_url: str = "https://api.omnia.reainternal.net"
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url.rstrip("/")
        self.chat = Chat(self)

        if not self.api_key:
            raise ValueError(
                "API key is required. Set OPENAI_API_KEY environment variable or pass api_key parameter."
            )

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for API requests"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "CustomOpenAIClient/1.0",
        }

    def _make_chat_request(
        self,
        model: str,
        messages: List[Dict],
        max_tokens: int = 1000,
        temperature: float = 0.1,
        **kwargs,
    ) -> ChatCompletion:
        """Make a chat completion request to the API"""

        url = f"{self.base_url}/v1/chat/completions"

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            **kwargs,
        }

        headers = self._get_headers()

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()

            response_data = response.json()
            return ChatCompletion(response_data)

        except requests.exceptions.RequestException as e:
            if hasattr(e, "response") and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_message = error_data.get("error", {}).get("message", str(e))
                except:
                    error_message = f"HTTP {e.response.status_code}: {e.response.text}"
            else:
                error_message = str(e)

            raise Exception(f"API request failed: {error_message}")
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse API response: {str(e)}")
        except Exception as e:
            raise Exception(f"Unexpected error: {str(e)}")


# Alias for compatibility
OpenAI = CustomOpenAIClient
