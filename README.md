# StockFlow

A full-stack inventory and order management system built with FastAPI, React,
PostgreSQL, and Docker.

## Features

- Separate customer storefront and protected admin portal
- Customer cart, checkout, and personal order history
- Admin order review and fulfilment status updates
- Product management with unique, normalized SKUs
- Customer management with unique email addresses
- Inventory counts, low-stock indicators, and inventory valuation
- Multi-item order creation
- Transactional stock validation and automatic stock reduction
- Row locking to prevent concurrent orders from overselling stock
- Responsive dashboard for desktop, tablet, and mobile
- Interactive API documentation
- Docker Compose setup with health checks and persistent database storage

## Run with Docker

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   On PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Replace the sample database password in `.env`.

3. Build and start the application:

   ```bash
   docker compose up --build
   ```

4. Open:

   - Frontend: http://localhost:3000
   - API: http://localhost:8000
   - API documentation: http://localhost:8000/docs

For local development, the admin portal key is configured with
`ADMIN_API_KEY`. The current example value is `admin123`; replace it with a
strong secret before deployment.

Stop the stack with `docker compose down`. Database data remains in the
`postgres_data` volume.

## Run locally for development

Start PostgreSQL and provide a valid `DATABASE_URL`, then run:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
$env:DATABASE_URL = "postgresql+psycopg://inventory:inventory@localhost:5432/inventory"
$env:CORS_ORIGINS = "http://localhost:5173"
uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

## Test the business rules

```powershell
cd backend
pytest
```

The tests cover unique SKUs/emails, stock reduction, total calculation, and
rejection of orders with insufficient inventory.

## API summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET / POST | `/api/products` | List or create products |
| PATCH / DELETE | `/api/products/{id}` | Update or delete a product |
| GET / POST | `/api/customers` | List or create customers |
| PATCH / DELETE | `/api/customers/{id}` | Update or delete a customer |
| GET / POST | `/api/orders` | List or place orders |
| GET | `/health` | Service health check |

## Deployment notes

Recommended free deployment:

1. Push this repository to GitHub.
2. In Render, create a Blueprint from the repository. `render.yaml` configures
   the FastAPI service.
3. Configure these Render secrets:
   - `DATABASE_URL`: Neon PostgreSQL URL using the
     `postgresql+psycopg://` scheme.
   - `CORS_ORIGINS`: the public Vercel frontend URL.
4. In Vercel, import the same repository and set the Root Directory to
   `frontend`.
5. Configure `VITE_API_URL` in Vercel with the public Render backend URL.
6. Redeploy the Vercel project after adding the environment variable.

Never commit `.env` files. Rotate any credential that has been exposed in chat,
logs, screenshots, or repository history.

### Docker images

After installing Docker Desktop:

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/stockflow-api:latest ./backend
docker build \
  --build-arg VITE_API_URL=https://YOUR_RENDER_SERVICE.onrender.com \
  -t YOUR_DOCKERHUB_USERNAME/stockflow-web:latest ./frontend
docker push YOUR_DOCKERHUB_USERNAME/stockflow-api:latest
docker push YOUR_DOCKERHUB_USERNAME/stockflow-web:latest
```
