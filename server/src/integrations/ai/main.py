import asyncio
import base64
import json
import re
import sys

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import ValidationError

from ai_processor import MAX_PDF_BYTES, ReaderError, extract
from schemas import Extraction, ExtractionRequest

app = FastAPI(title="MPC GenAI Reader")


def read_key(authorization: str) -> str:
    match = re.fullmatch(r"Bearer ([!-~]{1,4096})", authorization, re.IGNORECASE)
    if not match:
        raise ReaderError(401, "A provider API key is required.")
    return match[1]


async def analyze(request: ExtractionRequest, authorization: str, pdf: bytes | None = None) -> Extraction:
    try:
        return await extract(request, read_key(authorization), pdf)
    except ReaderError as error:
        raise HTTPException(error.status, str(error)) from None


@app.get("/")
def health_check():
    return {"status": "online", "service": "ai-reader", "key_source": "request"}


@app.post("/api/process-email", response_model=Extraction)
async def process_email(request: ExtractionRequest, authorization: str = Header("")):
    return await analyze(request, authorization)


@app.post("/api/process-report", response_model=Extraction)
async def process_report(
    provider: str = Form(...),
    model: str = Form(...),
    sender: str = Form(""),
    subject: str = Form(""),
    body: str = Form(""),
    pdf_file: UploadFile | None = File(None),
    authorization: str = Header(""),
):
    try:
        request = ExtractionRequest(
            provider=provider, model=model, sender=sender, subject=subject, body=body,
            filename=(pdf_file.filename or "") if pdf_file else "",
        )
        pdf = await pdf_file.read(MAX_PDF_BYTES + 1) if pdf_file else None
    except ValidationError:
        raise HTTPException(422, "Invalid provider, model, or document fields.") from None
    finally:
        if pdf_file:
            await pdf_file.close()
    return await analyze(request, authorization, pdf)


async def extract_from_stdin() -> dict:
    try:
        payload = json.load(sys.stdin)
        request = ExtractionRequest.model_validate(payload["request"])
        key = read_key(payload["authorization"])
        encoded_pdf = payload.get("pdf")
        if encoded_pdf is not None and len(encoded_pdf) > 4 * ((MAX_PDF_BYTES + 2) // 3):
            raise ReaderError(413, "The PDF must be at most 5 MiB.")
        pdf = base64.b64decode(encoded_pdf, validate=True) if encoded_pdf is not None else None
        result = await extract(request, key, pdf)
        return {"extraction": result.model_dump()}
    except ReaderError as error:
        return {"status": error.status, "error": str(error)}
    except (TypeError, KeyError, ValueError):
        return {"status": 400, "error": "Invalid reader input."}


if __name__ == "__main__":
    if sys.argv[1:] == ["--extract-json"]:
        print(json.dumps(asyncio.run(extract_from_stdin()), ensure_ascii=True))
    else:
        import uvicorn

        uvicorn.run(app, host="127.0.0.1", port=8000)
