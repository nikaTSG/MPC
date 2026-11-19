from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Provider = Literal["openai", "gemini", "anthropic"]
FaultSeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
DocumentCategory = Literal["DEFECT_REPORT", "VESSEL_UPDATE", "SUPPLIER_QUOTE", "OTHER"]


class IncomingMessage(BaseModel):
    sender: str = Field(default="", max_length=320)
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=32_000)
    filename: str = Field(default="", max_length=200)


class ExtractionRequest(IncomingMessage):
    provider: Provider
    model: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")


class ExtractedPart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    partNumber: str | None
    partName: str
    quantity: int | None
    notes: str | None


class ExtractedFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: str = Field(description="The reported value, including its units or currency.")


class Extraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: DocumentCategory
    vesselName: str | None
    imo: str | None = Field(description="The seven-digit IMO explicitly stated in the document.")
    severity: FaultSeverity | None
    summary: str
    parts: list[ExtractedPart]
    facts: list[ExtractedFact]
