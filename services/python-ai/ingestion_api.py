"""
Universal Ingestion API — accepts any file and returns extracted signals.
POST /api/ingest — upload any file (Excel, Word, PDF, DBC, CSV, XML)
"""
from fastapi import APIRouter, UploadFile, File, Query
from extraction.universal_ingestion import UniversalIngestionEngine
import tempfile, os

router = APIRouter()
engine = UniversalIngestionEngine()

@router.post("/api/ingest")
async def ingest_file(file: UploadFile = File(...), protocol_hint: str = Query(default="", description="Optional protocol hint: arinc429, can, milstd1553, afdx")):
    """Upload any ICD file — AI extracts signals automatically.
    
    Supports: .xlsx, .xls, .csv, .dbc, .pdf, .docx, .xml, .reqif, .txt
    
    The AI will:
    1. Detect the file format and structure
    2. Extract all signal/parameter definitions
    3. Map to ConnectedICD's 3-layer model (logical, transport, physical)
    4. Flag low-confidence extractions for human review
    """
    content = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower()
    
    # Save to temp file for processing
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        result = await engine.ingest(tmp_path, content, ext)
        result["filename"] = file.filename
        return result
    finally:
        os.unlink(tmp_path)


@router.post("/api/ingest/preview")
async def preview_extraction(file: UploadFile = File(...)):
    """Preview what the AI would extract — doesn't import anything."""
    content = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower()
    
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        result = await engine.ingest(tmp_path, content, ext)
        return {
            "filename": file.filename,
            "format": ext,
            "signals_found": result["signals_found"],
            "needs_review": result["needs_review"],
            "preview": result["signals"][:10],  # First 10 only
            "message": f"Found {result['signals_found']} signals. {result['needs_review']} need human review."
        }
    finally:
        os.unlink(tmp_path)
