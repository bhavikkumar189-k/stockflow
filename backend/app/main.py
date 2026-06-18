import os
import base64
import hashlib
import hmac
from contextlib import asynccontextmanager
from decimal import Decimal

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import models, schemas
from .database import Base, engine, get_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Inventory & Order Management API",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
cors_origin_regex = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"https://stockflow-[a-z0-9-]+-bhavikkumar189-5894s-projects\.vercel\.app",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def commit_or_conflict(db: Session, detail: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=detail)


def require_admin(x_admin_key: str | None = Header(default=None)):
    expected = os.getenv("ADMIN_API_KEY", "admin123")
    if not x_admin_key or x_admin_key != expected:
        raise HTTPException(status_code=401, detail="Invalid admin access key.")


def create_customer_token(customer: models.Customer) -> str:
    payload = f"{customer.id}:{customer.email}".encode()
    secret = os.getenv("CUSTOMER_TOKEN_SECRET", "local-customer-secret").encode()
    signature = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    encoded_payload = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return f"{encoded_payload}.{signature}"


def require_customer(
    x_customer_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.Customer:
    if not x_customer_token or "." not in x_customer_token:
        raise HTTPException(status_code=401, detail="Customer session is required.")
    encoded_payload, signature = x_customer_token.split(".", 1)
    try:
        padded = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = base64.urlsafe_b64decode(padded).decode()
        customer_id_text, email = payload.split(":", 1)
        customer_id = int(customer_id_text)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=401, detail="Invalid customer session.")
    secret = os.getenv("CUSTOMER_TOKEN_SECRET", "local-customer-secret").encode()
    expected = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid customer session.")
    customer = db.get(models.Customer, customer_id)
    if not customer or customer.email != email:
        raise HTTPException(status_code=401, detail="Customer session has expired.")
    return customer


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/admin/verify")
def verify_admin(_: None = Depends(require_admin)):
    return {"role": "admin", "authenticated": True}


@app.get("/api/products", response_model=list[schemas.ProductRead])
def list_products(db: Session = Depends(get_db)):
    return db.scalars(select(models.Product).order_by(models.Product.id.desc())).all()


@app.post(
    "/api/products",
    response_model=schemas.ProductRead,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    product = models.Product(**payload.model_dump())
    db.add(product)
    commit_or_conflict(db, "A product with this SKU already exists.")
    db.refresh(product)
    return product


@app.patch("/api/products/{product_id}", response_model=schemas.ProductRead)
def update_product(
    product_id: int,
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    commit_or_conflict(db, "A product with this SKU already exists.")
    db.refresh(product)
    return product


@app.delete("/api/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    db.delete(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Products used in orders cannot be deleted."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/customers", response_model=list[schemas.CustomerRead])
def list_customers(
    db: Session = Depends(get_db), _: None = Depends(require_admin)
):
    return db.scalars(select(models.Customer).order_by(models.Customer.id.desc())).all()


@app.post(
    "/api/customers",
    response_model=schemas.CustomerRead,
    status_code=status.HTTP_201_CREATED,
)
def create_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    commit_or_conflict(db, "A customer with this email already exists.")
    db.refresh(customer)
    return customer


@app.patch("/api/customers/{customer_id}", response_model=schemas.CustomerRead)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    commit_or_conflict(db, "A customer with this email already exists.")
    db.refresh(customer)
    return customer


@app.delete("/api/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    db.delete(customer)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Customers with orders cannot be deleted."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/customers/access", response_model=schemas.CustomerSession)
def access_customer(payload: schemas.CustomerAccess, db: Session = Depends(get_db)):
    customer = db.scalar(
        select(models.Customer).where(models.Customer.email == payload.email)
    )
    if customer:
        customer.name = payload.name
        customer.phone = payload.phone
        db.commit()
        db.refresh(customer)
        return {
            "customer": customer,
            "access_token": create_customer_token(customer),
        }
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    commit_or_conflict(db, "Unable to create customer profile.")
    db.refresh(customer)
    return {
        "customer": customer,
        "access_token": create_customer_token(customer),
    }


@app.get(
    "/api/customers/{customer_id}/orders",
    response_model=list[schemas.OrderRead],
)
def list_customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    customer: models.Customer = Depends(require_customer),
):
    if customer.id != customer_id:
        raise HTTPException(status_code=403, detail="You can only view your own orders.")
    query = (
        select(models.Order)
        .where(models.Order.customer_id == customer_id)
        .options(selectinload(models.Order.items))
        .order_by(models.Order.id.desc())
    )
    return db.scalars(query).all()


@app.get("/api/orders", response_model=list[schemas.OrderRead])
def list_orders(
    db: Session = Depends(get_db), _: None = Depends(require_admin)
):
    query = (
        select(models.Order)
        .options(selectinload(models.Order.items))
        .order_by(models.Order.id.desc())
    )
    return db.scalars(query).all()


@app.patch("/api/orders/{order_id}/status", response_model=schemas.OrderRead)
def update_order_status(
    order_id: int,
    payload: schemas.OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    order = db.scalar(
        select(models.Order)
        .where(models.Order.id == order_id)
        .options(selectinload(models.Order.items))
        .with_for_update()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.status == "cancelled" and payload.status != "cancelled":
        raise HTTPException(status_code=409, detail="Cancelled orders cannot be reopened.")
    if order.status == "delivered" and payload.status != "delivered":
        raise HTTPException(status_code=409, detail="Delivered orders cannot be changed.")
    transitions = {
        "placed": {"placed", "confirmed", "cancelled"},
        "confirmed": {"confirmed", "packed", "cancelled"},
        "packed": {"packed", "shipped", "cancelled"},
        "shipped": {"shipped", "delivered"},
    }
    if payload.status not in transitions.get(order.status, {order.status}):
        raise HTTPException(
            status_code=409,
            detail=f"Order cannot move from {order.status} to {payload.status}.",
        )
    if payload.status == "cancelled" and order.status != "cancelled":
        product_ids = [item.product_id for item in order.items]
        products = db.scalars(
            select(models.Product)
            .where(models.Product.id.in_(product_ids))
            .with_for_update()
        ).all()
        products_by_id = {product.id: product for product in products}
        for item in order.items:
            products_by_id[item.product_id].stock += item.quantity
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order


@app.post(
    "/api/orders",
    response_model=schemas.OrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_order(
    payload: schemas.OrderCreate,
    db: Session = Depends(get_db),
    customer: models.Customer = Depends(require_customer),
):
    if customer.id != payload.customer_id:
        raise HTTPException(status_code=403, detail="You can only place your own orders.")

    requested = {item.product_id: item.quantity for item in payload.items}
    products = db.scalars(
        select(models.Product)
        .where(models.Product.id.in_(requested))
        .with_for_update()
    ).all()
    products_by_id = {product.id: product for product in products}

    missing_ids = set(requested) - set(products_by_id)
    if missing_ids:
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail=f"Products not found: {sorted(missing_ids)}",
        )

    shortages = [
        f"{product.name} (available {product.stock}, requested {requested[product.id]})"
        for product in products
        if product.stock < requested[product.id]
    ]
    if shortages:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Insufficient stock: " + "; ".join(shortages),
        )

    total = Decimal("0.00")
    order = models.Order(customer_id=payload.customer_id, total=total)
    db.add(order)
    for product in products:
        quantity = requested[product.id]
        product.stock -= quantity
        total += product.price * quantity
        order.items.append(
            models.OrderItem(
                product_id=product.id,
                quantity=quantity,
                unit_price=product.price,
            )
        )
    order.total = total
    db.commit()
    return db.scalar(
        select(models.Order)
        .where(models.Order.id == order.id)
        .options(selectinload(models.Order.items))
    )
