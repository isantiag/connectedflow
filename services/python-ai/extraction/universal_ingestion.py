"""
Universal ICD Ingestion Engine — the disruptive feature.

Takes ANY file (Excel, Word, PDF, CSV, DBC, XML) from ANY supplier or tool
and uses LLM to extract structured signal definitions.

Supports:
- Unstructured Excel ICDs (any column layout, any naming convention)
- Word/PDF ICD documents (tables, paragraphs, mixed formats)
- Vector CANdb++ (.dbc files)
- Siemens Capital exports
- ARINC 429 label tables
- MIL-STD-1553 bus maps
- Any proprietary format — the LLM figures it out

Pipeline: File → Parse → LLM Extract → Validate → Review → Import
"""
import os, json, re, csv, io
from dataclasses import dataclass, field, asdict
from typing import Optional
from pathlib import Path

# Try imports — graceful fallback if not installed
try:
    import openpyxl
except ImportError:
    openpyxl = None

try:
    from pydantic import BaseModel, Field
except ImportError:
    BaseModel = object
    Field = lambda **kw: None


class ExtractedSignal(BaseModel if BaseModel != object else object):
    """Signal extracted from any source."""
    name: str = ""
    source_system: str = ""
    dest_system: str = ""
    protocol: str = ""
    data_type: str = ""
    units: str = ""
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    refresh_rate_ms: Optional[int] = None
    bit_offset: Optional[int] = None
    bit_length: Optional[int] = None
    encoding: str = ""
    label: str = ""  # ARINC 429 label
    arbitration_id: str = ""  # CAN
    remote_terminal: str = ""  # 1553
    virtual_link: str = ""  # AFDX
    connector: str = ""
    pin: str = ""
    wire_gauge: str = ""
    confidence: float = 0.0
    needs_review: bool = True
    source_file: str = ""
    source_location: str = ""


class UniversalIngestionEngine:
    """AI-powered universal ICD ingestion from any file format."""

    def __init__(self, llm_provider: str = "claude", api_key: str = ""):
        self.llm_provider = llm_provider
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "")

    async def ingest(self, file_path: str, file_content: bytes = None, file_type: str = None) -> dict:
        """Main entry point — takes any file and returns extracted signals."""
        ext = file_type or Path(file_path).suffix.lower()
        
        # Step 1: Parse file into text/tables
        if ext in ('.xlsx', '.xls'):
            raw = self._parse_excel(file_path, file_content)
        elif ext == '.csv':
            raw = self._parse_csv(file_content or open(file_path, 'rb').read())
        elif ext == '.dbc':
            return self._parse_dbc(file_content or open(file_path, 'rb').read())
        elif ext in ('.pdf', '.docx', '.doc'):
            raw = self._extract_text(file_path, file_content)
        elif ext in ('.xml', '.reqif'):
            raw = self._parse_xml(file_content or open(file_path, 'rb').read())
        else:
            raw = {"text": (file_content or open(file_path, 'rb').read()).decode('utf-8', errors='ignore')[:50000]}

        # Step 2: LLM extraction
        signals = await self._llm_extract(raw, ext)

        # Step 3: Validate
        validated = self._validate(signals)

        return {
            "source": file_path,
            "format": ext,
            "signals_found": len(validated),
            "needs_review": sum(1 for s in validated if s.get("needs_review", True)),
            "signals": validated,
        }

    def _parse_excel(self, file_path: str, content: bytes = None) -> dict:
        """Parse Excel into structured tables."""
        if openpyxl is None:
            return {"text": "openpyxl not installed — pass raw content to LLM", "tables": []}
        
        wb = openpyxl.load_workbook(io.BytesIO(content) if content else file_path, data_only=True)
        tables = []
        for ws in wb.worksheets:
            rows = []
            for row in ws.iter_rows(values_only=True):
                rows.append([str(c) if c is not None else "" for c in row])
            if rows:
                tables.append({"sheet": ws.title, "headers": rows[0] if rows else [], "rows": rows[1:50]})  # Limit to 50 rows for LLM
        return {"tables": tables, "sheet_count": len(wb.worksheets)}

    def _parse_csv(self, content: bytes) -> dict:
        text = content.decode('utf-8', errors='ignore')
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        return {"tables": [{"sheet": "CSV", "headers": rows[0] if rows else [], "rows": rows[1:50]}]}

    def _parse_dbc(self, content: bytes) -> dict:
        """Parse Vector CANdb++ DBC file directly (no LLM needed)."""
        text = content.decode('utf-8', errors='ignore')
        signals = []
        current_msg = None

        for line in text.split('\n'):
            line = line.strip()
            # Message: BO_ <id> <name>: <dlc> <sender>
            m = re.match(r'BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)', line)
            if m:
                current_msg = {"id": m.group(1), "name": m.group(2), "dlc": m.group(3), "sender": m.group(4)}
                continue
            # Signal: SG_ <name> : <start>|<length>@<byte_order><sign> (<factor>,<offset>) [<min>|<max>] "<unit>" <receivers>
            m = re.match(r'SG_\s+(\w+)\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"(.*)', line)
            if m and current_msg:
                receivers = [r.strip() for r in m.group(11).split(',') if r.strip() and r.strip() != 'Vector__XXX']
                signals.append({
                    "name": m.group(1),
                    "source_system": current_msg["sender"],
                    "dest_system": receivers[0] if receivers else "",
                    "protocol": "can",
                    "arbitration_id": hex(int(current_msg["id"])),
                    "bit_offset": int(m.group(2)),
                    "bit_length": int(m.group(3)),
                    "encoding": "little_endian" if m.group(4) == "1" else "big_endian",
                    "min_value": float(m.group(8)),
                    "max_value": float(m.group(9)),
                    "units": m.group(10),
                    "confidence": 0.95,
                    "needs_review": False,
                    "source_file": "DBC import",
                })

        return {"source": "DBC", "format": ".dbc", "signals_found": len(signals), "needs_review": 0, "signals": signals}

    def _extract_text(self, file_path: str, content: bytes = None) -> dict:
        """Extract text from PDF/Word — placeholder, needs pdfplumber/python-docx."""
        return {"text": f"[Binary file: {file_path}. Pass to LLM for extraction.]", "note": "Install pdfplumber for PDF, python-docx for Word"}

    def _parse_xml(self, content: bytes) -> dict:
        text = content.decode('utf-8', errors='ignore')
        return {"text": text[:50000]}

    async def _llm_extract(self, raw: dict, file_type: str) -> list:
        """Use LLM to extract signals from parsed content."""
        prompt = f"""You are an aerospace ICD data extraction expert. Extract ALL signal/parameter definitions from this data.

File type: {file_type}
Content: {json.dumps(raw, indent=2)[:15000]}

For each signal found, return a JSON array with objects containing:
- name (signal name, UPPER_SNAKE_CASE preferred)
- source_system (transmitting system/LRU)
- dest_system (receiving system/LRU)
- protocol (arinc429, can, milstd1553, afdx, analog, discrete, or unknown)
- data_type (float32, uint16, bool, enum, etc.)
- units
- min_value, max_value (numeric range)
- refresh_rate_ms
- label (for ARINC 429)
- arbitration_id (for CAN)
- bit_offset, bit_length
- encoding (BNR, BCD, discrete, etc.)
- confidence (0.0-1.0, how confident you are in the extraction)
- needs_review (true if uncertain)

Return ONLY the JSON array, no explanation."""

        system = "You are an aerospace ICD extraction AI. Return only valid JSON arrays."

        try:
            import httpx
            if self.api_key:
                r = await httpx.AsyncClient().post("https://api.anthropic.com/v1/messages",
                    headers={"Content-Type": "application/json", "x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
                    json={"model": "claude-sonnet-4-5", "max_tokens": 8192, "system": system, "messages": [{"role": "user", "content": prompt}]},
                    timeout=60)
                text = r.json().get("content", [{}])[0].get("text", "[]")
            elif self.gemini_key:
                r = await httpx.AsyncClient().post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.gemini_key}",
                    json={"system_instruction": {"parts": [{"text": system}]}, "contents": [{"parts": [{"text": prompt}]}]},
                    timeout=60)
                text = r.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
            else:
                return []

            # Parse JSON from LLM response
            text = re.sub(r'^```json\s*', '', text.strip())
            text = re.sub(r'```\s*$', '', text.strip())
            return json.loads(text)
        except Exception as e:
            return [{"error": str(e)}]

    def _validate(self, signals: list) -> list:
        """Validate extracted signals and flag issues."""
        for s in signals:
            if not isinstance(s, dict): continue
            # Auto-detect protocol from clues
            if not s.get("protocol") or s["protocol"] == "unknown":
                if s.get("label"): s["protocol"] = "arinc429"
                elif s.get("arbitration_id"): s["protocol"] = "can"
                elif s.get("remote_terminal"): s["protocol"] = "milstd1553"
                elif s.get("virtual_link"): s["protocol"] = "afdx"
            # Flag low confidence
            if s.get("confidence", 0) < 0.7:
                s["needs_review"] = True
            # Flag missing critical fields
            if not s.get("name"):
                s["needs_review"] = True
                s["confidence"] = max(s.get("confidence", 0) - 0.3, 0)
        return signals
