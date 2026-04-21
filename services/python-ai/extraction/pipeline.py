"""Document extraction pipeline using LangChain and LLM APIs."""

import os
import json
from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel, Field


class ExtractedSignal(BaseModel):
    """A signal extracted from a document with confidence score."""

    name: str = ""
    data_type: str = ""
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    units: str = ""
    description: str = ""
    source_system: str = ""
    dest_system: str = ""
    refresh_rate_hz: Optional[float] = None
    protocol: str = ""
    bit_offset: Optional[int] = None
    bit_length: Optional[int] = None
    encoding: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    needs_review: bool = True
    source_location: str = ""


class ExtractedTable(BaseModel):
    """A table extracted from a document."""

    page: int = 0
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class ExtractionStatistics(BaseModel):
    """Statistics about the extraction run."""

    total_tables_found: int = 0
    total_signals_extracted: int = 0
    avg_confidence: float = 0.0
    high_confidence_count: int = 0
    low_confidence_count: int = 0
    unmapped_field_count: int = 0


@dataclass
class ExtractionRequest:
    """Input for the extraction pipeline."""

    document_bytes: bytes
    mime_type: str
    filename: str


class ExtractionResponse(BaseModel):
    """Output from the extraction pipeline."""

    signals: list[ExtractedSignal] = Field(default_factory=list)
    tables: list[ExtractedTable] = Field(default_factory=list)
    unmapped_fields: list[str] = Field(default_factory=list)
    statistics: ExtractionStatistics = Field(default_factory=ExtractionStatistics)


# Confidence threshold — signals below this are flagged for review
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.7"))

# LLM provider: "openai" or "anthropic"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")


EXTRACTION_PROMPT = """You are an aerospace ICD (Interface Control Document) signal extraction expert.
Analyze the following document content and extract all signal definitions you can find.

For each signal, extract:
- name, data_type, min_value, max_value, units, description
- source_system, dest_system, refresh_rate_hz
- protocol, bit_offset, bit_length, encoding

Return a JSON array of objects. Include a "confidence" field (0.0-1.0) for each signal.

Document content:
{content}
"""


def _parse_document(doc_bytes: bytes, mime_type: str) -> str:
    """Parse document bytes into text using appropriate loader."""
    # For PDF documents
    if mime_type in ("application/pdf",):
        try:
            from langchain_community.document_loaders import PyPDFLoader
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(doc_bytes)
                f.flush()
                loader = PyPDFLoader(f.name)
                docs = loader.load()
                return "\n\n".join(doc.page_content for doc in docs)
        except ImportError:
            return doc_bytes.decode("utf-8", errors="replace")

    # For Word documents
    if mime_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        try:
            from langchain_community.document_loaders import Docx2txtLoader
            import tempfile

            suffix = ".docx" if "openxmlformats" in mime_type else ".doc"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(doc_bytes)
                f.flush()
                loader = Docx2txtLoader(f.name)
                docs = loader.load()
                return "\n\n".join(doc.page_content for doc in docs)
        except ImportError:
            return doc_bytes.decode("utf-8", errors="replace")

    # For Excel documents
    if mime_type in (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ):
        try:
            from langchain_community.document_loaders import UnstructuredExcelLoader
            import tempfile

            suffix = ".xlsx" if "openxmlformats" in mime_type else ".xls"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(doc_bytes)
                f.flush()
                loader = UnstructuredExcelLoader(f.name)
                docs = loader.load()
                return "\n\n".join(doc.page_content for doc in docs)
        except ImportError:
            return doc_bytes.decode("utf-8", errors="replace")

    # Fallback: treat as plain text
    return doc_bytes.decode("utf-8", errors="replace")


async def _call_llm(prompt: str) -> str:
    """Call the configured LLM provider for structured extraction."""
    if LLM_PROVIDER == "anthropic":
        try:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic()
            message = await client.messages.create(
                model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            return message.content[0].text
        except Exception:
            return "[]"
    else:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI()
            response = await client.chat.completions.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content or "[]"
        except Exception:
            return "[]"


def _parse_llm_response(raw: str) -> list[dict]:
    """Parse LLM JSON response into a list of signal dicts."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "signals" in parsed:
            return parsed["signals"]
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def _build_signals(raw_signals: list[dict]) -> list[ExtractedSignal]:
    """Convert raw LLM output dicts into ExtractedSignal models."""
    signals: list[ExtractedSignal] = []
    for raw in raw_signals:
        confidence = float(raw.get("confidence", 0.0))
        signal = ExtractedSignal(
            name=raw.get("name", ""),
            data_type=raw.get("data_type", ""),
            min_value=raw.get("min_value"),
            max_value=raw.get("max_value"),
            units=raw.get("units", ""),
            description=raw.get("description", ""),
            source_system=raw.get("source_system", ""),
            dest_system=raw.get("dest_system", ""),
            refresh_rate_hz=raw.get("refresh_rate_hz"),
            protocol=raw.get("protocol", ""),
            bit_offset=raw.get("bit_offset"),
            bit_length=raw.get("bit_length"),
            encoding=raw.get("encoding", ""),
            confidence=max(0.0, min(1.0, confidence)),
            needs_review=confidence < CONFIDENCE_THRESHOLD,
            source_location=raw.get("source_location", ""),
        )
        signals.append(signal)
    return signals


def _compute_statistics(
    signals: list[ExtractedSignal],
    tables: list[ExtractedTable],
    unmapped: list[str],
) -> ExtractionStatistics:
    """Compute extraction statistics from results."""
    total = len(signals)
    avg_conf = sum(s.confidence for s in signals) / total if total > 0 else 0.0
    high = sum(1 for s in signals if s.confidence >= CONFIDENCE_THRESHOLD)
    low = total - high
    return ExtractionStatistics(
        total_tables_found=len(tables),
        total_signals_extracted=total,
        avg_confidence=round(avg_conf, 3),
        high_confidence_count=high,
        low_confidence_count=low,
        unmapped_field_count=len(unmapped),
    )


class ExtractionPipeline:
    """Orchestrates document parsing → LLM extraction → structured output."""

    async def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        # Step 1: Parse document into text
        text_content = _parse_document(request.document_bytes, request.mime_type)

        if not text_content.strip():
            return ExtractionResponse()

        # Step 2: Call LLM for signal extraction
        prompt = EXTRACTION_PROMPT.format(content=text_content[:8000])
        llm_response = await _call_llm(prompt)

        # Step 3: Parse LLM response
        raw_signals = _parse_llm_response(llm_response)

        # Step 4: Build typed signals with confidence scoring
        signals = _build_signals(raw_signals)

        # Step 5: Compute statistics
        tables: list[ExtractedTable] = []
        unmapped: list[str] = []
        statistics = _compute_statistics(signals, tables, unmapped)

        return ExtractionResponse(
            signals=signals,
            tables=tables,
            unmapped_fields=unmapped,
            statistics=statistics,
        )
