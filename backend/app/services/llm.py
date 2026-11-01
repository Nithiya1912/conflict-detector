"""Configurable LLM provider adapter.

The generative layer is optional. When configured it:
  * writes a concise, auditable explanation for each rule-detected conflict, and
  * may suggest additional candidate conflicts, which are always stored as
    "Uncertain / Insufficient Evidence" and routed to human review.
It never assigns or changes severity. Outputs are validated with Pydantic.
Only de-identified note text is sent to the provider.
"""
import logging
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from ..config import get_settings

log = logging.getLogger("cicd.llm")


class ConflictExplanation(BaseModel):
    conflict_ref: str = Field(description="The conflict reference given in the prompt, e.g. C1")
    explanation: str = Field(description="2-4 sentence plain-language explanation grounded only in the given instructions and evidence")
    clarification_questions: list[str] = Field(default_factory=list, description="Questions a clinician could ask the authoring specialists")
    limitations: str = Field(description="What the explanation cannot establish from the given inputs")


class CandidateSuggestion(BaseModel):
    instruction_refs: list[str] = Field(description="Two or more instruction references, e.g. ['I3','I7']")
    category: Literal["Drug–Drug", "Drug–Diet", "Diet–Diet", "Drug–Lifestyle", "Diet–Lifestyle", "Lifestyle–Lifestyle", "Other cross-instruction"]
    title: str
    rationale: str


class LLMAnalysis(BaseModel):
    explanations: list[ConflictExplanation]
    additional_candidates: list[CandidateSuggestion] = Field(default_factory=list)


class LLMProvider(Protocol):
    name: str
    model: str

    def analyze(self, instructions: list[dict], conflicts: list[dict]) -> LLMAnalysis: ...


SYSTEM_PROMPT = """You assist a clinical decision-support research prototype that checks whether instructions
written by different specialists are compatible when followed together. You receive de-identified, synthetic
instructions and conflicts already detected by deterministic rules, with any retrieved evidence passages.

For each detected conflict, write a short explanation a clinician can audit: state which instructions interact,
why they may be incompatible, and what the retrieved evidence does or does not show. Use only the information
provided; do not introduce doses, timings, diagnoses or citations that are not in the input. Do not recommend
treatment changes; suggest questions to clarify with the authoring specialists instead.

You may list additional candidate conflicts between the listed instructions that the rules did not flag, if the
inputs give a concrete reason. These will be treated as unverified and reviewed by a clinician. Return an empty list
when you have no well-grounded suggestion. Do not assign severity."""


def _render(instructions: list[dict], conflicts: list[dict]) -> str:
    lines = ["INSTRUCTIONS:"]
    for idx, i in enumerate(instructions, 1):
        lines.append(f"I{idx} [{i.get('specialty', 'unknown')} note {i.get('source_id', i['note_id'])}] "
                     f"{i['kind']}: {i['entity']} ({i['direction']}) — “{i['span_text']}”")
    lines.append("\nDETECTED CONFLICTS:")
    for idx, c in enumerate(conflicts, 1):
        lines.append(f"C{idx} ({c['category']}, rule {c['rule_id']}): {c['title']}")
        for s in c["instructions_snapshot"]:
            lines.append(f"   - {s['entity']}: “{s['span_text']}”")
        sup = [e for e in c["evidence"] if e.get("supporting")]
        for e in sup[:2]:
            lines.append(f"   evidence ({e['title']}{', synthetic' if e.get('is_synthetic') else ''}): {e['text'][:500]}")
        if not sup:
            lines.append("   evidence: none retrieved")
    return "\n".join(lines)


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float):
        import anthropic  # imported lazily so the app runs without the provider configured

        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=2)
        self.model = model

    def analyze(self, instructions: list[dict], conflicts: list[dict]) -> LLMAnalysis:
        a = self._anthropic
        try:
            response = self.client.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                output_config={"effort": "medium"},
                messages=[{"role": "user", "content": _render(instructions, conflicts)}],
                output_format=LLMAnalysis,
                # Server-side refusal fallback (routes by refusal category).
                extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
                extra_body={"fallbacks": "default"},
            )
        except a.RateLimitError as e:
            raise LLMError(f"Provider rate limit: {e}") from e
        except a.APIStatusError as e:
            raise LLMError(f"Provider returned HTTP {e.status_code}") from e
        except a.APIConnectionError as e:
            raise LLMError("Could not reach the LLM provider") from e
        if response.stop_reason == "refusal":
            raise LLMError("The model declined to answer this request")
        if response.parsed_output is None:
            raise LLMError("Model output did not validate against the expected schema")
        return response.parsed_output


class LLMError(RuntimeError):
    pass


def get_provider() -> LLMProvider | None:
    s = get_settings()
    if s.llm_provider == "anthropic" and s.anthropic_api_key:
        return AnthropicProvider(s.anthropic_api_key, s.llm_model, s.llm_timeout_seconds)
    return None


def provider_status() -> dict:
    s = get_settings()
    configured = s.llm_provider == "anthropic" and bool(s.anthropic_api_key)
    return {"provider": s.llm_provider, "model": s.llm_model if configured else None, "configured": configured,
            "note": "Generative explanations enabled." if configured else
            "No LLM provider configured: analysis runs on deterministic rules, KG and retrieval only."}
