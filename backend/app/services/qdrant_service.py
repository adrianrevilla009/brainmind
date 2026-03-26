"""
Servicio RAG con Qdrant.

Qdrant gestiona los embeddings de resúmenes SOAP.
Los embeddings los genera Ollama (nomic-embed-text, 768 dims).
PostgreSQL guarda el qdrant_point_id para cruzar referencias.

Colección: 'clinical_summaries'
  - payload: pseudo_token, appointment_id, session_number, date
  - vector: embedding 768 dims del texto SOAP concatenado
"""
import logging
import uuid
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

QDRANT_URL = settings.qdrant_url
COLLECTION  = "clinical_summaries"
VECTOR_SIZE = 768  # nomic-embed-text


# ─── Inicialización de la colección ──────────────────────────────────────────

async def ensure_collection() -> None:
    """Crea la colección en Qdrant si no existe. Se llama al arrancar."""
    async with httpx.AsyncClient(timeout=10) as client:
        # Comprobar si ya existe
        resp = await client.get(f"{QDRANT_URL}/collections/{COLLECTION}")
        if resp.status_code == 200:
            return

        # Crear con distancia coseno
        resp = await client.put(
            f"{QDRANT_URL}/collections/{COLLECTION}",
            json={
                "vectors": {
                    "size": VECTOR_SIZE,
                    "distance": "Cosine",
                }
            },
        )
        resp.raise_for_status()
        logger.info(f"Colección Qdrant '{COLLECTION}' creada.")


# ─── Embeddings via Ollama ────────────────────────────────────────────────────

async def get_embedding(text: str) -> list[float] | None:
    """Genera embedding con Ollama nomic-embed-text (768 dims)."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={"model": settings.ollama_embed_model, "prompt": text},
            )
            resp.raise_for_status()
            return resp.json()["embedding"]
    except Exception as e:
        logger.warning(f"Error generando embedding: {e}")
        return None


# ─── Indexar resumen ──────────────────────────────────────────────────────────

async def index_summary(
    summary_id: str,
    pseudo_token: str,
    appointment_id: str,
    session_number: int,
    session_date: str,
    soap_text: str,
) -> str | None:
    """
    Vectoriza el texto SOAP y lo inserta en Qdrant.
    Devuelve el point_id (UUID str) para guardarlo en PostgreSQL.
    """
    embedding = await get_embedding(soap_text)
    if embedding is None:
        logger.warning(f"No se pudo generar embedding para summary {summary_id}")
        return None

    point_id = str(uuid.uuid4())

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.put(
            f"{QDRANT_URL}/collections/{COLLECTION}/points",
            json={
                "points": [
                    {
                        "id": point_id,
                        "vector": embedding,
                        "payload": {
                            "pseudo_token": pseudo_token,
                            "summary_id": summary_id,
                            "appointment_id": appointment_id,
                            "session_number": session_number,
                            "session_date": session_date,
                        },
                    }
                ]
            },
        )
        resp.raise_for_status()

    logger.info(f"Summary {summary_id} indexado en Qdrant → point {point_id}")
    return point_id


# ─── Búsqueda RAG ─────────────────────────────────────────────────────────────

async def search_patient_context(
    pseudo_token: str,
    query_text: str,
    top_k: int | None = None,
) -> list[dict]:
    """
    Busca los resúmenes más similares al query para un paciente concreto.
    Filtra por pseudo_token para garantizar aislamiento RGPD.
    Devuelve lista de payloads ordenados por similitud.
    """
    k = top_k or settings.rag_top_k
    embedding = await get_embedding(query_text)
    if embedding is None:
        return []

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{QDRANT_URL}/collections/{COLLECTION}/points/search",
                json={
                    "vector": embedding,
                    "limit": k,
                    "filter": {
                        "must": [
                            {
                                "key": "pseudo_token",
                                "match": {"value": pseudo_token},
                            }
                        ]
                    },
                    "with_payload": True,
                },
            )
            resp.raise_for_status()
            results = resp.json().get("result", [])
            return [r["payload"] for r in results]
    except Exception as e:
        logger.warning(f"Error en búsqueda Qdrant: {e}")
        return []


# ─── Borrado RGPD ─────────────────────────────────────────────────────────────

async def delete_patient_vectors(pseudo_token: str) -> int:
    """
    Borra todos los vectores de un paciente (derecho al olvido RGPD).
    Devuelve número de puntos eliminados.
    """
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{QDRANT_URL}/collections/{COLLECTION}/points/delete",
            json={
                "filter": {
                    "must": [
                        {"key": "pseudo_token", "match": {"value": pseudo_token}}
                    ]
                }
            },
        )
        resp.raise_for_status()
        result = resp.json()
        count = result.get("result", {}).get("deleted", 0)
        logger.info(f"Borrados {count} vectores para pseudo_token {pseudo_token[:8]}...")
        return count
