from fastapi import FastAPI

app = FastAPI(title="Simonizer API")


@app.get("/health")
async def health():
    return {"status": "ok"}
