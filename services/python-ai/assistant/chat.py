"""AI assistant for ICD-related queries with RAG support."""

import os
import json
from typing import Optional

from pydantic import BaseModel, Field


class SignalContext(BaseModel):
    """Signal data provided as context for the assistant."""

    signal_id: str = ""
    name: str = ""
    data_type: str = ""
    protocol: str = ""
    description: str = ""


class ProjectContext(BaseModel):
    """Project metadata provided as context."""

    project_name: str = ""
    aircraft_type: str = ""
    certification_basis: str = ""


class ChatRequest(BaseModel):
    """Input for the AI assistant."""

    question: str
    signal_context: list[SignalContext] = Field(default_factory=list)
    project_context: Optional[ProjectContext] = None
    conversation_history: list[dict] = Field(default_factory=list)


class ChatResponse(BaseModel):
    """Output from the AI assistant."""

    answer: str
    sources: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")

SYSTEM_PROMPT = """You are an expert AI assistant for aerospace Interface Control Document (ICD) management.
You help engineers with:
- Signal definitions across logical, transport, and physical layers
- Protocol-specific questions (ARINC 429, CAN Bus, MIL-STD-1553, ARINC 664/AFDX)
- Cross-layer consistency and validation
- Bus loading analysis and optimization
- Certification and traceability guidance

When signal context is provided, reference specific signals in your answers.
When project context is provided, tailor advice to the aircraft type and certification basis.
Be precise, technical, and actionable.
"""


def _build_context_message(request: ChatRequest) -> str:
    """Build a context string from signal and project data (RAG pattern)."""
    parts: list[str] = []

    if request.project_context:
        pc = request.project_context
        parts.append(
            f"Project: {pc.project_name} | Aircraft: {pc.aircraft_type} | Cert: {pc.certification_basis}"
        )

    if request.signal_context:
        parts.append(f"Relevant signals ({len(request.signal_context)}):")
        for sig in request.signal_context[:20]:  # Limit context window
            parts.append(
                f"  - {sig.name}: {sig.data_type}, {sig.protocol}, {sig.description}"
            )

    return "\n".join(parts)


async def _call_llm_chat(
    system: str, context: str, question: str, history: list[dict]
) -> str:
    """Call the configured LLM for a chat response."""
    messages = [{"role": "system", "content": system}]

    if context:
        messages.append({"role": "system", "content": f"Context:\n{context}"})

    for entry in history[-10:]:  # Keep last 10 turns
        messages.append(
            {"role": entry.get("role", "user"), "content": entry.get("content", "")}
        )

    messages.append({"role": "user", "content": question})

    if LLM_PROVIDER == "anthropic":
        try:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic()
            # Anthropic uses system param separately
            sys_content = "\n\n".join(
                m["content"] for m in messages if m["role"] == "system"
            )
            user_messages = [m for m in messages if m["role"] != "system"]
            message = await client.messages.create(
                model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
                max_tokens=2048,
                system=sys_content,
                messages=user_messages,
            )
            return message.content[0].text
        except Exception as e:
            return f"I encountered an issue processing your request. Please try again. (Error: {str(e)})"
    else:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI()
            response = await client.chat.completions.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
                messages=messages,
            )
            return response.choices[0].message.content or "No response generated."
        except Exception as e:
            return f"I encountered an issue processing your request. Please try again. (Error: {str(e)})"


class AssistantService:
    """ICD-aware AI assistant with RAG support."""

    async def chat(self, request: ChatRequest) -> ChatResponse:
        context = _build_context_message(request)

        answer = await _call_llm_chat(
            system=SYSTEM_PROMPT,
            context=context,
            question=request.question,
            history=request.conversation_history,
        )

        # Derive suggested actions from context
        suggested_actions: list[str] = []
        if request.signal_context:
            suggested_actions.append("View signal details")
        if request.project_context:
            suggested_actions.append("View project dashboard")

        sources: list[str] = []
        if request.signal_context:
            sources = [s.signal_id for s in request.signal_context[:5] if s.signal_id]

        return ChatResponse(
            answer=answer,
            sources=sources,
            suggested_actions=suggested_actions,
        )
