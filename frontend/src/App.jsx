import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Box,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Edit3,
  LogOut,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));

const statusTransitions = {
  placed: ["placed", "confirmed", "cancelled"],
  confirmed: ["confirmed", "packed", "cancelled"],
  packed: ["packed", "shipped", "cancelled"],
  shipped: ["shipped", "delivered"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};
const emptyProduct = { name: "", sku: "", description: "", price: "", stock: "" };

function Notice({ message, error, clear }) {
  if (!message) return null;
  return (
    <div className={`notice ${error ? "error" : ""}`}>
      {error ? <X size={17} /> : <CheckCircle2 size={17} />}
      <span>{message}</span>
      <button onClick={clear}><X size={15} /></button>
    </div>
  );
}

function RoleEntry({ onUser, onAdmin }) {
  return (
    <main className="entry-page">
      <section className="entry-copy">
        <div className="logo"><Box size={24} /><span>StockFlow</span></div>
        <p className="overline">Inventory & commerce workspace</p>
        <h1>One system.<br /><em>Two clear experiences.</em></h1>
        <p className="lead">
          Customers discover and order products. Administrators control inventory,
          customers, fulfilment, and business operations.
        </p>
        <div className="entry-points">
          <div><ShoppingBag size={19} /><span><strong>Shop with confidence</strong><small>Live inventory and order tracking</small></span></div>
          <div><ShieldCheck size={19} /><span><strong>Operate with control</strong><small>Protected administration workspace</small></span></div>
        </div>
      </section>
      <section className="role-panel">
        <span className="panel-label">Choose your portal</span>
        <button className="role-card customer" onClick={onUser}>
          <span className="role-icon"><User size={24} /></span>
          <span><strong>Customer portal</strong><small>Browse products, place orders and track delivery</small></span>
          <ChevronRight size={20} />
        </button>
        <button className="role-card admin" onClick={onAdmin}>
          <span className="role-icon"><ShieldCheck size={24} /></span>
          <span><strong>Admin portal</strong><small>Manage inventory, customers and order status</small></span>
          <ChevronRight size={20} />
        </button>
        <p className="secure-note"><ShieldCheck size={14} /> Admin actions require an access key.</p>
      </section>
    </main>
  );
}

function AccessCard({ type, onBack, onSubmit, busy, error }) {
  const [form, setForm] = useState(
    type === "admin" ? { key: "" } : { name: "", email: "", phone: "" },
  );
  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  return (
    <main className="access-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} />Back</button>
      <form className="access-card" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <span className={`access-icon ${type}`} >
          {type === "admin" ? <ShieldCheck size={27} /> : <User size={27} />}
        </span>
        <p className="overline">{type === "admin" ? "Protected workspace" : "Customer access"}</p>
        <h1>{type === "admin" ? "Admin sign in" : "Start shopping"}</h1>
        <p>{type === "admin" ? "Enter the administration key configured on the server." : "Enter your details to shop and view your order history."}</p>
        {error && <div className="inline-error">{error}</div>}
        {type === "admin" ? (
          <label>Admin access key<input autoFocus type="password" required value={form.key} onChange={update("key")} placeholder="Enter access key" /></label>
        ) : (
          <>
            <label>Full name<input required value={form.name} onChange={update("name")} placeholder="Your name" /></label>
            <label>Email address<input required type="email" value={form.email} onChange={update("email")} placeholder="you@example.com" /></label>
            <label>Phone <small>(optional)</small><input value={form.phone} onChange={update("phone")} placeholder="+91 98765 43210" /></label>
          </>
        )}
        <button className="main-button" disabled={busy}>{busy ? "Please wait…" : type === "admin" ? "Open admin portal" : "Continue to store"}<ChevronRight size={18} /></button>
      </form>
    </main>
  );
}

function Store({ customer, customerToken, logout }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [tab, setTab] = useState("shop");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState({ message: "", error: false });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [productData, orderData] = await Promise.all([
        api.products.list(),
        api.customers.orders(customer.id, customerToken),
      ]);
      setProducts(productData);
      setOrders(orderData);
    } catch (error) {
      if (error.message.toLowerCase().includes("customer session")) {
        logout();
        return;
      }
      setNotice({ message: error.message, error: true });
    }
  };
  useEffect(() => { load(); }, []);

  const cartLines = products
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, quantity: cart[product.id] }));
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
  const filtered = products.filter((product) =>
    `${product.name} ${product.description || ""} ${product.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  const changeCart = (product, amount) => {
    const next = Math.max(0, Math.min(product.stock, (cart[product.id] || 0) + amount));
    setCart({ ...cart, [product.id]: next });
  };
  const checkout = async () => {
    if (!cartLines.length) return;
    setBusy(true);
    try {
      await api.orders.create(
        {
          customer_id: customer.id,
          items: cartLines.map((line) => ({
            product_id: line.id,
            quantity: line.quantity,
          })),
        },
        customerToken,
      );
      setCart({});
      setNotice({ message: "Order placed successfully. Inventory has been reserved.", error: false });
      setTab("orders");
      await load();
    } catch (error) {
      setNotice({ message: error.message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="store-shell">
      <header className="store-header">
        <div className="logo dark"><Box size={22} /><span>StockFlow</span></div>
        <nav>
          <button className={tab === "shop" ? "active" : ""} onClick={() => setTab("shop")}>Store</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>My orders</button>
        </nav>
        <div className="store-actions">
          <button className="cart-button" onClick={() => setTab("cart")}><ShoppingCart size={19} /><span>{cartCount}</span></button>
          <div className="user-chip"><span>{customer.name[0].toUpperCase()}</span><div><strong>{customer.name}</strong><small>Customer</small></div></div>
          <button className="logout" onClick={logout} title="Log out"><LogOut size={18} /></button>
        </div>
      </header>
      <Notice {...notice} clear={() => setNotice({ message: "", error: false })} />

      {tab === "shop" && (
        <>
          <section className="shop-hero">
            <div><p className="overline">Curated inventory · Live availability</p><h1>Find what you need.<br /><em>Order in a few clicks.</em></h1><p>Every item reflects real-time stock from our inventory.</p></div>
            <div className="hero-art"><Package size={65} /><span>{products.reduce((sum, product) => sum + product.stock, 0)}<small>units available</small></span></div>
          </section>
          <section className="catalog-section">
            <div className="section-title"><div><p className="overline">Product catalog</p><h2>Available now</h2></div><label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" /></label></div>
            <div className="product-grid">
              {filtered.length ? filtered.map((product) => (
                <article className="shop-product" key={product.id}>
                  <div className="product-visual"><Package size={44} /><span className={product.stock ? "" : "sold"}>{product.stock ? `${product.stock} in stock` : "Sold out"}</span></div>
                  <div className="product-info"><small>{product.sku}</small><h3>{product.name}</h3><p>{product.description || "Quality product, ready to order."}</p><div className="buy-row"><strong>{money(product.price)}</strong>{cart[product.id] ? <div className="quantity"><button onClick={() => changeCart(product, -1)}><Minus size={14} /></button><span>{cart[product.id]}</span><button onClick={() => changeCart(product, 1)}><Plus size={14} /></button></div> : <button disabled={!product.stock} onClick={() => changeCart(product, 1)}><ShoppingBag size={16} />Add</button>}</div></div>
                </article>
              )) : <Empty icon={Search} title="No products found" text="Try another search or check back after inventory is added." />}
            </div>
          </section>
        </>
      )}

      {tab === "cart" && (
        <section className="customer-page">
          <div className="section-title"><div><p className="overline">Checkout</p><h2>Your cart</h2></div><button className="link-button" onClick={() => setTab("shop")}><ArrowLeft size={16} />Continue shopping</button></div>
          <div className="checkout-layout">
            <div className="cart-list">
              {cartLines.length ? cartLines.map((line) => <div className="cart-line" key={line.id}><span className="mini-visual"><Package size={25} /></span><div><strong>{line.name}</strong><small>{line.sku} · {money(line.price)} each</small></div><div className="quantity"><button onClick={() => changeCart(line, -1)}><Minus size={14} /></button><span>{line.quantity}</span><button onClick={() => changeCart(line, 1)}><Plus size={14} /></button></div><strong>{money(Number(line.price) * line.quantity)}</strong></div>) : <Empty icon={ShoppingCart} title="Your cart is empty" text="Add products from the store to place an order." />}
            </div>
            <aside className="summary-card"><p className="overline">Order summary</p><div><span>Items</span><strong>{cartCount}</strong></div><div><span>Customer</span><strong>{customer.name}</strong></div><div className="summary-total"><span>Total</span><strong>{money(cartTotal)}</strong></div><button className="main-button" disabled={!cartLines.length || busy} onClick={checkout}>{busy ? "Placing order…" : "Place order"}<ChevronRight size={18} /></button><small>Stock will be validated and reduced automatically.</small></aside>
          </div>
        </section>
      )}

      {tab === "orders" && (
        <section className="customer-page">
          <div className="section-title"><div><p className="overline">Order history</p><h2>My orders</h2></div></div>
          <div className="customer-orders">
            {orders.length ? orders.map((order) => <article className="customer-order" key={order.id}><div className="order-top"><div><small>ORDER #{String(order.id).padStart(4, "0")}</small><strong>{new Date(order.created_at).toLocaleDateString()}</strong></div><span className={`status ${order.status}`}>{order.status}</span></div><div className="order-products">{order.items.map((item) => { const product = products.find((entry) => entry.id === item.product_id); return <div key={item.id}><span>{product?.name || `Product #${item.product_id}`} × {item.quantity}</span><strong>{money(Number(item.unit_price) * item.quantity)}</strong></div>; })}</div><div className="order-bottom"><span>Total</span><strong>{money(order.total)}</strong></div></article>) : <Empty icon={ClipboardList} title="No orders yet" text="Your placed orders will appear here." />}
          </div>
        </section>
      )}
    </div>
  );
}

function Admin({ adminKey, logout }) {
  const [tab, setTab] = useState("overview");
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState({ message: "", error: false });
  const [productModal, setProductModal] = useState(null);
  const [form, setForm] = useState(emptyProduct);

  const load = async () => {
    try {
      const [p, c, o] = await Promise.all([
        api.products.list(), api.customers.list(adminKey), api.orders.list(adminKey),
      ]);
      setProducts(p); setCustomers(c); setOrders(o);
    } catch (error) {
      if (error.message === "Invalid admin access key.") {
        logout();
        return;
      }
      setNotice({ message: error.message, error: true });
    }
  };
  useEffect(() => { load(); }, []);
  const revenue = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + Number(order.total), 0);
  const lowStock = products.filter((product) => product.stock <= 5);
  const customerName = (id) => customers.find((customer) => customer.id === id)?.name || `Customer #${id}`;
  const productName = (id) => products.find((product) => product.id === id)?.name || `Product #${id}`;
  const openProduct = (product = null) => {
    setProductModal(product || {});
    setForm(product ? { name: product.name, sku: product.sku, description: product.description || "", price: product.price, stock: product.stock } : emptyProduct);
  };
  const saveProduct = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
      if (productModal.id) await api.products.update(productModal.id, payload, adminKey);
      else await api.products.create(payload, adminKey);
      setProductModal(null); setNotice({ message: "Product saved successfully.", error: false }); load();
    } catch (error) { setNotice({ message: error.message, error: true }); }
  };
  const removeProduct = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try { await api.products.remove(id, adminKey); load(); } catch (error) { setNotice({ message: error.message, error: true }); }
  };
  const changeStatus = async (id, status) => {
    try { await api.orders.status(id, status, adminKey); setNotice({ message: "Order status updated.", error: false }); load(); } catch (error) { setNotice({ message: error.message, error: true }); }
  };

  const nav = [
    ["overview", BarChart3, "Overview"], ["products", Package, "Products"],
    ["orders", ClipboardList, "Orders"], ["customers", Users, "Customers"],
  ];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="logo"><Box size={22} /><span>StockFlow</span></div>
        <p className="admin-caption">Administration</p>
        <nav>{nav.map(([id, Icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={18} />{label}</button>)}</nav>
        <div className="admin-profile"><span>A</span><div><strong>Administrator</strong><small>Full access</small></div><button onClick={logout}><LogOut size={17} /></button></div>
      </aside>
      <main className="admin-main">
        <header className="admin-header"><div><p className="overline">Operations workspace</p><h1>{nav.find(([id]) => id === tab)?.[2]}</h1></div>{tab === "products" && <button className="main-button compact" onClick={() => openProduct()}><Plus size={17} />Add product</button>}</header>
        <Notice {...notice} clear={() => setNotice({ message: "", error: false })} />
        <div className="admin-content">
          {tab === "overview" && <>
            <section className="admin-welcome"><div><p className="overline">Business control center</p><h2>Everything that needs your attention.</h2><p>Monitor sales, inventory and fulfilment from one protected workspace.</p></div><ShieldCheck size={55} /></section>
            <div className="metric-grid">
              <Metric icon={Package} label="Products" value={products.length} note={`${lowStock.length} low stock`} />
              <Metric icon={ClipboardList} label="Total orders" value={orders.length} note={`${orders.filter((o) => o.status === "placed").length} awaiting review`} />
              <Metric icon={Users} label="Customers" value={customers.length} note="Registered shoppers" />
              <Metric icon={BarChart3} label="Order value" value={money(revenue)} note="Excluding cancelled" />
            </div>
            <div className="admin-columns">
              <section className="admin-card">
                <div className="card-heading"><h3>Orders awaiting action</h3><button onClick={() => setTab("orders")}>View all</button></div>
                {orders.some((order) => ["placed", "confirmed"].includes(order.status))
                  ? orders.filter((order) => ["placed", "confirmed"].includes(order.status)).slice(0, 5).map((order) => <div className="admin-list-row" key={order.id}><span className="list-icon"><ShoppingBag size={17} /></span><div><strong>Order #{String(order.id).padStart(4, "0")}</strong><small>{customerName(order.customer_id)}</small></div><span className={`status ${order.status}`}>{order.status}</span></div>)
                  : <p className="small-empty">No orders are waiting for review.</p>}
              </section>
              <section className="admin-card">
                <div className="card-heading"><h3>Low inventory</h3><button onClick={() => setTab("products")}>Manage</button></div>
                {lowStock.length
                  ? lowStock.map((product) => <div className="admin-list-row" key={product.id}><span className="list-icon warning"><Package size={17} /></span><div><strong>{product.name}</strong><small>{product.sku}</small></div><strong>{product.stock} left</strong></div>)
                  : <p className="small-empty">All products have healthy stock.</p>}
              </section>
            </div>
          </>}
          {tab === "products" && <AdminProducts products={products} edit={openProduct} remove={removeProduct} />}
          {tab === "orders" && <AdminOrders orders={orders} customerName={customerName} productName={productName} changeStatus={changeStatus} />}
          {tab === "customers" && <AdminCustomers customers={customers} orders={orders} />}
        </div>
      </main>
      {productModal && <div className="modal-backdrop"><form className="product-modal" onSubmit={saveProduct}><div className="modal-title"><div><p className="overline">Inventory</p><h2>{productModal.id ? "Edit product" : "New product"}</h2></div><button type="button" onClick={() => setProductModal(null)}><X size={18} /></button></div><div className="two-fields"><label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label></div><label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><div className="two-fields"><label>Price<input required min="0" step=".01" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label><label>Stock<input required min="0" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label></div><div className="modal-actions"><button type="button" onClick={() => setProductModal(null)}>Cancel</button><button className="main-button">Save product</button></div></form></div>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, note }) {
  return <article className="metric"><span><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}
function AdminProducts({ products, edit, remove }) {
  return <section className="data-card"><div className="card-heading"><div><h3>Product inventory</h3><p>Pricing and stock available to customers</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Inventory</th><th>Store status</th><th /></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="table-product"><span><Package size={19} /></span><div><strong>{product.name}</strong><small>{product.description || "No description"}</small></div></div></td><td><code>{product.sku}</code></td><td>{money(product.price)}</td><td>{product.stock} units</td><td><span className={`status ${product.stock ? "delivered" : "cancelled"}`}>{product.stock ? "Visible" : "Sold out"}</span></td><td><div className="row-buttons"><button onClick={() => edit(product)}><Edit3 size={15} /></button><button onClick={() => remove(product.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section>;
}
function AdminOrders({ orders, customerName, productName, changeStatus }) {
  return <div className="admin-order-grid">{orders.length ? orders.map((order) => <article className="admin-order" key={order.id}><div className="order-top"><div><small>ORDER #{String(order.id).padStart(4, "0")}</small><strong>{customerName(order.customer_id)}</strong></div><select value={order.status} disabled={["cancelled", "delivered"].includes(order.status)} onChange={(e) => changeStatus(order.id, e.target.value)}>{statusTransitions[order.status].map((status) => <option key={status}>{status}</option>)}</select></div><div className="order-products">{order.items.map((item) => <div key={item.id}><span>{productName(item.product_id)} × {item.quantity}</span><strong>{money(Number(item.unit_price) * item.quantity)}</strong></div>)}</div><div className="order-bottom"><small>{new Date(order.created_at).toLocaleString()}</small><strong>{money(order.total)}</strong></div></article>) : <Empty icon={ClipboardList} title="No orders yet" text="Customer orders will appear here." />}</div>;
}
function AdminCustomers({ customers, orders }) {
  return <section className="data-card"><div className="card-heading"><div><h3>Customer directory</h3><p>People who have accessed the store</p></div></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Joined</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><div className="table-product"><span className="customer-avatar">{customer.name[0].toUpperCase()}</span><strong>{customer.name}</strong></div></td><td>{customer.email}</td><td>{customer.phone || "—"}</td><td>{orders.filter((order) => order.customer_id === customer.id).length}</td><td>{new Date(customer.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>;
}
function Empty({ icon: Icon, title, text }) {
  return <div className="empty"><span><Icon size={27} /></span><h3>{title}</h3><p>{text}</p></div>;
}

export default function App() {
  const storedCustomer = sessionStorage.getItem("stockflow-customer");
  const storedCustomerToken = sessionStorage.getItem("stockflow-customer-token");
  const storedKey = sessionStorage.getItem("stockflow-admin-key");
  let parsedCustomer = null;
  try {
    parsedCustomer = storedCustomer ? JSON.parse(storedCustomer) : null;
  } catch {
    sessionStorage.removeItem("stockflow-customer");
    sessionStorage.removeItem("stockflow-customer-token");
  }
  const hasCustomerSession = Boolean(parsedCustomer && storedCustomerToken);
  const [screen, setScreen] = useState(hasCustomerSession ? "store" : storedKey ? "admin" : "entry");
  const [customer, setCustomer] = useState(hasCustomerSession ? parsedCustomer : null);
  const [customerToken, setCustomerToken] = useState(storedCustomerToken || "");
  const [adminKey, setAdminKey] = useState(storedKey || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const userAccess = async (form) => {
    setBusy(true); setError("");
    try {
      const session = await api.customers.access(form);
      setCustomer(session.customer);
      setCustomerToken(session.access_token);
      sessionStorage.setItem("stockflow-customer", JSON.stringify(session.customer));
      sessionStorage.setItem("stockflow-customer-token", session.access_token);
      setScreen("store");
    }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const adminAccess = async ({ key }) => {
    setBusy(true); setError("");
    try { await api.admin.verify(key); setAdminKey(key); sessionStorage.setItem("stockflow-admin-key", key); setScreen("admin"); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const logout = () => { sessionStorage.clear(); setCustomer(null); setCustomerToken(""); setAdminKey(""); setScreen("entry"); };

  if (screen === "entry") return <RoleEntry onUser={() => { setError(""); setScreen("user-access"); }} onAdmin={() => { setError(""); setScreen("admin-access"); }} />;
  if (screen === "user-access") return <AccessCard type="user" onBack={() => setScreen("entry")} onSubmit={userAccess} busy={busy} error={error} />;
  if (screen === "admin-access") return <AccessCard type="admin" onBack={() => setScreen("entry")} onSubmit={adminAccess} busy={busy} error={error} />;
  if (screen === "store") return <Store customer={customer} customerToken={customerToken} logout={logout} />;
  return <Admin adminKey={adminKey} logout={logout} />;
}
