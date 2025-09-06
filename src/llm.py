import certifi
import ssl
import httpx
from typing import Optional
from settings import settings

try:
    from langchain_openai import ChatOpenAI
except Exception:
    AzureChatOpenAI = None

def build_chat_llm(
    azure_token: Optional[str] = None,
    azure_endpoint: Optional[str] = None,
    model_api_version: Optional[str] = None,
    deployment_name: Optional[str] = None,
    openai_api_key: Optional[str] = None,
):


    ca_certs = certifi.where()
    ssl_context = ssl.create_default_context(cafile=ca_certs)
    http_client = httpx.Client(verify=ssl_context)
    # --- Decide which authentication method to use ---
    if settings.openapi_subscription_key:
        # Use API Key in header
        default_headers = {"Ocp-Apim-Subscription-Key": settings.openapi_subscription_key}
    elif azure_token:
        # Use Bearer token
        default_headers = {"Authorization": f"Bearer {azure_token}"}
    else:
        default_headers = None

    # return AzureChatOpenAI(
      
    #     openai_api_version=model_api_version or settings.openai_api_version,
    #     deployment_name=deployment_name or settings.openai_deployment,
    #     openai_api_key=openai_api_key or settings.openai_api_key or "unused",
    #     openai_api_type="azure",
    #     temperature=0,
    #     max_tokens=500,
    #     http_client=http_client,
    #     default_headers=default_headers,
    # )
    return ChatOpenAI(
    model=settings.model_name,
    openai_api_key=settings.openapi_subscription_key,  # your OpenAI key
    temperature=0
)
