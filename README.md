# ms-scraping

Microservicio de scraping e ingesta de ofertas en tabla `Trabajo`.

## Endpoints

- `POST /scraping/job`
  - Ingesta manual de una oferta.
- `POST /scraping/jobs`
  - Ingesta manual masiva de ofertas.
- `POST /scraping/start`
  - Ejecuta scraping por profesion y guarda resultados en `Trabajo`.
  - Body:
  ```json
  {
    "profession": "desarrollador frontend",
    "sources": ["indeed", "linkedin"],
    "linksPerSource": 10
  }
  ```
- `GET /scraping/sources`
  - Lista de fuentes disponibles.
- `GET /scraping/status`
  - Estado de la ultima corrida.
- `GET /health`
  - Health check.

## Fuentes soportadas

- indeed
- linkedin
- jooble
- opcionempleo
- talent

## Notas

- Se deduplica por `fuente + urlOriginal` normalizada.
- El contrato de error usa `error.code`, `error.message`, `error.httpStatus` y `error.details`.
