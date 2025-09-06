from pydantic_settings import BaseSettings
from typing import List, Optional
from pathlib import Path
from datetime import datetime
from azure.identity import CertificateCredential

# Current directory (where this file is located)
curr_dir = Path(__file__).parent if "__file__" in globals() else Path.cwd()


class Settings(BaseSettings):
    """
    Centralized application configuration.
    Values are loaded automatically from environment variables or `.env` file.
    """

    # --- Server Settings ---
    host: str = "0.0.0.0"                 # Default host
    port: int = 8000                      # Default port
    debug: bool = True                    # Enable debug mode

    # --- Database Settings ---
    sqlite_url: str = "sqlite:///./commet_graph.db"  # SQLite DB URL

    # --- CORS (Cross-Origin Resource Sharing) ---
    allow_origins: List[str] = [
        "http://localhost:3000",          # Frontend
        "http://localhost:8000",          # Backend
    ]

    # --- OpenAI / API Keys ---
    openai_api_key: Optional[str] = None
    openai_model_url: Optional[str] = None

    # --- AWS / Azure Integration ---
    aws_region: Optional[str] = None

    # --- OpenAI Authentication (Azure AD or custom auth) ---
    openai_auth_scope: Optional[str] = None
    openai_secret_arn: Optional[str] = None
    openai_auth_client_id: Optional[str] = None
    openai_auth_tenant_id: Optional[str] = None

    # --- Model Information ---
    model_api_version: Optional[str] = None
    model_name: Optional[str] = None
    
    openapi_subscription_key: Optional[str] = None

    # --- Certificates ---
    pem_file_path: Optional[str] = None

    # --- Private Attributes for Token Caching ---
    _cached_token: Optional[str] = None
    _token_expiry: Optional[datetime] = None

    class Config:
        """
        Pydantic Settings configuration:
        - Reads values from `.env` file in current directory
        - UTF-8 encoding for environment variables
        """
        env_file = curr_dir / ".env"
        env_file_encoding = "utf-8"


# Instantiate settings so it can be imported directly
settings = Settings()
