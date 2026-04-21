"""ConnectedICD Python AI Service — FastAPI application."""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from extraction.pipeline import ExtractionPipeline, ExtractionRequest, ExtractionResponse
from assistant.chat import AssistantService, ChatRequest, ChatResponse

app = FastAPI(
    title="ConnectedICD AI Service",
    description="LLM-powered document extraction and AI assistant for ICD management",
    version="0.1.0",
)

extraction_pipeline = ExtractionPipeline()
assistant_service = AssistantService()


@app.get("/health")
async def health_check():
    """Kubernetes readiness/liveness probe endpoint."""
    return {"status": "healthy", "service": "python-ai"}


@app.get("/ready")
async def readiness_check():
    """Readiness probe — checks that dependencies are available."""
    return {"status": "ready"}


@app.post("/extract", response_model=ExtractionResponse)
async def extract_document(
    file: UploadFile = File(...),
    mime_type: Optional[str] = Form(None),
):
    """Extract signals and tables from an uploaded document."""
    content = await file.read()
    resolved_mime = mime_type or file.content_type or "application/octet-stream"

    request = ExtractionRequest(
        document_bytes=content,
        mime_type=resolved_mime,
        filename=file.filename or "unknown",
    )

    try:
        result = await extraction_pipeline.extract(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@app.post("/assistant/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """AI assistant endpoint for ICD-related queries."""
    try:
        result = await assistant_service.chat(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assistant error: {str(e)}")
