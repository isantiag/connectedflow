"""Tests for the document extraction pipeline."""

import json
import pytest
from unittest.mock import patch, AsyncMock

from extraction.pipeline import (
    ExtractionPipeline,
    ExtractionRequest,
    ExtractedSignal,
    _parse_llm_response,
    _build_signals,
    _compute_statistics,
    _parse_document,
    CONFIDENCE_THRESHOLD,
)


class TestParseDocument:
    """Tests for document parsing to text."""

    def test_plain_text_passthrough(self):
        content = b"Signal A: 0-100 volts"
        result = _parse_document(content, "text/plain")
        assert result == "Signal A: 0-100 volts"

    def test_unknown_mime_falls_back_to_text(self):
        content = b"some data"
        result = _parse_document(content, "application/octet-stream")
        assert result == "some data"

    def test_binary_content_decoded_with_replace(self):
        content = b"\xff\xfe raw bytes"
        result = _parse_document(content, "text/plain")
        assert "raw bytes" in result


class TestParseLLMResponse:
    """Tests for LLM response JSON parsing."""

    def test_parses_json_array(self):
        raw = json.dumps([{"name": "SIG_A", "confidence": 0.9}])
        result = _parse_llm_response(raw)
        assert len(result) == 1
        assert result[0]["name"] == "SIG_A"

    def test_parses_json_object_with_signals_key(self):
        raw = json.dumps({"signals": [{"name": "SIG_B"}]})
        result = _parse_llm_response(raw)
        assert len(result) == 1

    def test_returns_empty_on_invalid_json(self):
        assert _parse_llm_response("not json") == []

    def test_returns_empty_on_unexpected_structure(self):
        assert _parse_llm_response(json.dumps({"foo": "bar"})) == []


class TestBuildSignals:
    """Tests for converting raw dicts to ExtractedSignal models."""

    def test_builds_signal_with_all_fields(self):
        raw = [
            {
                "name": "AIRSPEED",
                "data_type": "float32",
                "min_value": 0.0,
                "max_value": 500.0,
                "units": "knots",
                "confidence": 0.95,
            }
        ]
        signals = _build_signals(raw)
        assert len(signals) == 1
        assert signals[0].name == "AIRSPEED"
        assert signals[0].confidence == 0.95
        assert signals[0].needs_review is False

    def test_low_confidence_flagged_for_review(self):
        raw = [{"name": "UNKNOWN_SIG", "confidence": 0.3}]
        signals = _build_signals(raw)
        assert signals[0].needs_review is True

    def test_confidence_clamped_to_valid_range(self):
        raw = [{"name": "A", "confidence": 1.5}]
        signals = _build_signals(raw)
        assert signals[0].confidence == 1.0

    def test_missing_confidence_defaults_to_zero(self):
        raw = [{"name": "B"}]
        signals = _build_signals(raw)
        assert signals[0].confidence == 0.0
        assert signals[0].needs_review is True


class TestComputeStatistics:
    """Tests for extraction statistics computation."""

    def test_empty_signals(self):
        stats = _compute_statistics([], [], [])
        assert stats.total_signals_extracted == 0
        assert stats.avg_confidence == 0.0

    def test_statistics_match_signal_data(self):
        signals = [
            ExtractedSignal(name="A", confidence=0.9, needs_review=False),
            ExtractedSignal(name="B", confidence=0.5, needs_review=True),
            ExtractedSignal(name="C", confidence=0.8, needs_review=False),
        ]
        stats = _compute_statistics(signals, [], ["unmapped_field_1"])
        assert stats.total_signals_extracted == 3
        assert stats.high_confidence_count == 2
        assert stats.low_confidence_count == 1
        assert stats.unmapped_field_count == 1
        assert 0.73 <= stats.avg_confidence <= 0.74


class TestExtractionPipeline:
    """Integration tests for the full extraction pipeline (mocked LLM)."""

    @pytest.mark.asyncio
    async def test_extract_empty_document(self):
        pipeline = ExtractionPipeline()
        request = ExtractionRequest(
            document_bytes=b"",
            mime_type="text/plain",
            filename="empty.txt",
        )
        result = await pipeline.extract(request)
        assert result.statistics.total_signals_extracted == 0

    @pytest.mark.asyncio
    @patch("extraction.pipeline._call_llm", new_callable=AsyncMock)
    async def test_extract_with_mocked_llm(self, mock_llm):
        mock_llm.return_value = json.dumps([
            {
                "name": "ENGINE_TEMP",
                "data_type": "float32",
                "min_value": -40.0,
                "max_value": 200.0,
                "units": "celsius",
                "confidence": 0.92,
                "protocol": "ARINC429",
            },
            {
                "name": "FUEL_FLOW",
                "data_type": "uint16",
                "confidence": 0.45,
                "protocol": "CANBUS",
            },
        ])

        pipeline = ExtractionPipeline()
        request = ExtractionRequest(
            document_bytes=b"Engine temperature signal definition table...",
            mime_type="text/plain",
            filename="icd_doc.txt",
        )
        result = await pipeline.extract(request)

        assert result.statistics.total_signals_extracted == 2
        assert result.signals[0].name == "ENGINE_TEMP"
        assert result.signals[0].needs_review is False
        assert result.signals[1].name == "FUEL_FLOW"
        assert result.signals[1].needs_review is True
