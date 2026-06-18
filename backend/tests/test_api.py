import os
from pathlib import Path

TEST_DB = Path(__file__).parent / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app

ADMIN_HEADERS = {"X-Admin-Key": "admin123"}


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module():
    engine.dispose()
    TEST_DB.unlink(missing_ok=True)


def create_customer(client):
    return client.post(
        "/api/customers",
        json={"name": "Ada Lovelace", "email": "ada@example.com"},
        headers=ADMIN_HEADERS,
    )


def create_product(client, stock=10):
    return client.post(
        "/api/products",
        json={
            "name": "Mechanical Keyboard",
            "sku": "key-001",
            "price": 75.5,
            "stock": stock,
        },
        headers=ADMIN_HEADERS,
    )


def customer_token(client):
    return client.post(
        "/api/customers/access",
        json={"name": "Ada Lovelace", "email": "ada@example.com"},
    ).json()["access_token"]


def test_unique_product_sku_and_customer_email():
    with TestClient(app) as client:
        assert create_product(client).status_code == 201
        assert create_product(client).status_code == 409
        assert create_customer(client).status_code == 201
        assert create_customer(client).status_code == 409


def test_order_reduces_inventory_and_calculates_total():
    with TestClient(app) as client:
        customer = create_customer(client).json()
        product = create_product(client, stock=10).json()
        token = customer_token(client)

        response = client.post(
            "/api/orders",
            json={
                "customer_id": customer["id"],
                "items": [{"product_id": product["id"], "quantity": 3}],
            },
            headers={"X-Customer-Token": token},
        )

        assert response.status_code == 201
        assert response.json()["total"] == "226.50"
        remaining = client.get("/api/products").json()[0]["stock"]
        assert remaining == 7


def test_order_is_rejected_when_stock_is_insufficient():
    with TestClient(app) as client:
        customer = create_customer(client).json()
        product = create_product(client, stock=2).json()
        token = customer_token(client)

        response = client.post(
            "/api/orders",
            json={
                "customer_id": customer["id"],
                "items": [{"product_id": product["id"], "quantity": 3}],
            },
            headers={"X-Customer-Token": token},
        )

        assert response.status_code == 409
        assert "Insufficient stock" in response.json()["detail"]
        remaining = client.get("/api/products").json()[0]["stock"]
        assert remaining == 2


def test_customer_portal_only_returns_own_orders():
    with TestClient(app) as client:
        session = client.post(
            "/api/customers/access",
            json={"name": "Ada Lovelace", "email": "ada@example.com"},
        ).json()
        customer = session["customer"]
        token = session["access_token"]
        product = create_product(client, stock=5).json()
        client.post(
            "/api/orders",
            json={
                "customer_id": customer["id"],
                "items": [{"product_id": product["id"], "quantity": 1}],
            },
            headers={"X-Customer-Token": token},
        )

        response = client.get(
            f"/api/customers/{customer['id']}/orders",
            headers={"X-Customer-Token": token},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_admin_can_cancel_order_and_restore_stock():
    with TestClient(app) as client:
        customer = create_customer(client).json()
        product = create_product(client, stock=5).json()
        token = customer_token(client)
        order = client.post(
            "/api/orders",
            json={
                "customer_id": customer["id"],
                "items": [{"product_id": product["id"], "quantity": 2}],
            },
            headers={"X-Customer-Token": token},
        ).json()

        response = client.patch(
            f"/api/orders/{order['id']}/status",
            json={"status": "cancelled"},
            headers=ADMIN_HEADERS,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        assert client.get("/api/products").json()[0]["stock"] == 5


def test_admin_endpoints_require_access_key():
    with TestClient(app) as client:
        assert client.get("/api/orders").status_code == 401
        assert client.get("/api/customers").status_code == 401


def test_customer_cannot_read_or_place_another_customers_order():
    with TestClient(app) as client:
        first = client.post(
            "/api/customers/access",
            json={"name": "Ada", "email": "ada@example.com"},
        ).json()
        second = client.post(
            "/api/customers/access",
            json={"name": "Grace", "email": "grace@example.com"},
        ).json()
        product = create_product(client, stock=5).json()

        forbidden_order = client.post(
            "/api/orders",
            json={
                "customer_id": second["customer"]["id"],
                "items": [{"product_id": product["id"], "quantity": 1}],
            },
            headers={"X-Customer-Token": first["access_token"]},
        )
        forbidden_history = client.get(
            f"/api/customers/{second['customer']['id']}/orders",
            headers={"X-Customer-Token": first["access_token"]},
        )

        assert forbidden_order.status_code == 403
        assert forbidden_history.status_code == 403


def test_order_status_cannot_move_backwards():
    with TestClient(app) as client:
        customer = create_customer(client).json()
        product = create_product(client, stock=5).json()
        token = customer_token(client)
        order = client.post(
            "/api/orders",
            json={
                "customer_id": customer["id"],
                "items": [{"product_id": product["id"], "quantity": 1}],
            },
            headers={"X-Customer-Token": token},
        ).json()
        client.patch(
            f"/api/orders/{order['id']}/status",
            json={"status": "confirmed"},
            headers=ADMIN_HEADERS,
        )

        response = client.patch(
            f"/api/orders/{order['id']}/status",
            json={"status": "placed"},
            headers=ADMIN_HEADERS,
        )

        assert response.status_code == 409
        assert "cannot move" in response.json()["detail"]


def test_shipped_order_cannot_be_cancelled():
    with TestClient(app) as client:
        customer = create_customer(client).json()
        product = create_product(client, stock=5).json()
        token = customer_token(client)
        order = client.post(
            "/api/orders",
            json={
                "customer_id": customer["id"],
                "items": [{"product_id": product["id"], "quantity": 1}],
            },
            headers={"X-Customer-Token": token},
        ).json()
        for next_status in ("confirmed", "packed", "shipped"):
            client.patch(
                f"/api/orders/{order['id']}/status",
                json={"status": next_status},
                headers=ADMIN_HEADERS,
            )

        response = client.patch(
            f"/api/orders/{order['id']}/status",
            json={"status": "cancelled"},
            headers=ADMIN_HEADERS,
        )

        assert response.status_code == 409
        assert client.get("/api/products").json()[0]["stock"] == 4
