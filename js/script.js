"use strict";

const CART_KEY = "rsfPhoneCartV2";
const CURRENCY = new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" });
const DATE_TIME = new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeStyle: "short" });
const STATUS_LABELS = {
    scheduled: "Agendada",
    confirmed: "Confirmada",
    completed: "Completada",
    cancelled: "Cancelada"
};

const state = {
    services: [],
    cart: loadCart(),
    session: null,
    user: null,
    role: "guest",
    supabase: null,
    authConfigured: false,
    persistent: false,
    toastTimer: null
};

const byId = (id) => document.getElementById(id);

function loadCart() {
    try {
        const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
        return Array.isArray(stored)
            ? stored.filter((item) => typeof item?.id === "string" && Number.isInteger(item.quantity) && item.quantity > 0)
            : [];
    } catch {
        return [];
    }
}

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function money(value) {
    return CURRENCY.format(Number(value) || 0).replace("GTQ", "Q");
}

function showToast(message, type = "success") {
    const toast = byId("toast");
    toast.textContent = message;
    toast.classList.toggle("error", type === "error");
    toast.classList.add("visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 3400);
}

function showLoading(container, title = "Cargando…") {
    container.replaceChildren();
    const box = makeElement("div", "loading-state");
    box.append(makeElement("h3", "", title), makeElement("p", "", "Un momento, estamos consultando la información."));
    container.append(box);
}

function showEmpty(container, title, message) {
    container.replaceChildren();
    const box = makeElement("div", "empty-state");
    box.append(makeElement("h3", "", title), makeElement("p", "", message));
    container.append(box);
}

async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;

    const response = await fetch(path, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
        throw new Error(data?.error || `La solicitud falló (${response.status}).`);
    }

    return data;
}

async function loadConfiguration() {
    try {
        const config = await api("/api/config");
        state.authConfigured = Boolean(config.authConfigured);
        byId("configurationBanner").classList.toggle("hidden", state.authConfigured);

        if (!state.authConfigured || !window.supabase?.createClient) return;

        state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: { persistSession: true, detectSessionInUrl: true }
        });

        const { data } = await state.supabase.auth.getSession();
        await applySession(data.session);

        state.supabase.auth.onAuthStateChange((event, session) => {
            window.setTimeout(() => applySession(session), 0);
        });
    } catch (error) {
        byId("configurationBanner").classList.remove("hidden");
        console.error(error);
    }
}

async function applySession(session) {
    state.session = session;
    state.user = null;
    state.role = session ? "customer" : "guest";

    if (session) {
        try {
            state.user = await api("/api/me");
            state.role = state.user.role;
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    updateAccountUI();
    updateCheckoutVisibility();
}

function updateAccountUI() {
    const signedIn = Boolean(state.session && state.user);
    byId("loginButton").classList.toggle("hidden", signedIn);
    byId("profileButton").classList.toggle("hidden", !signedIn);
    byId("accountMenu").classList.add("hidden");

    document.querySelectorAll(".owner-only:not(.page-section)").forEach((element) => {
        element.classList.toggle("hidden", state.role !== "owner");
    });

    if (state.role !== "owner") {
        byId("admin").classList.add("hidden");
        byId("adminServiceList").replaceChildren();
        byId("adminOrdersList").replaceChildren();
    }

    if (!signedIn) {
        byId("pedidos").classList.add("hidden");
        byId("ordersContent").replaceChildren();
    }

    if (!signedIn) return;

    byId("profileName").textContent = state.user.name?.split(" ")[0] || "Mi cuenta";
    byId("accountEmail").textContent = state.user.email;
    byId("accountRole").textContent = state.role === "owner" ? "Propietario" : "Cliente";
    byId("accountRole").classList.toggle("owner", state.role === "owner");

    const avatar = byId("profileAvatar");
    if (state.user.avatarUrl) {
        avatar.src = state.user.avatarUrl;
        avatar.classList.remove("hidden");
    } else {
        avatar.removeAttribute("src");
        avatar.classList.add("hidden");
    }

    if (state.role === "owner") renderAdminServices();
}

async function loginWithGoogle() {
    if (!state.authConfigured || !state.supabase) {
        showToast("El acceso con Google quedará disponible al conectar Supabase en Render.", "error");
        return;
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await state.supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
    });

    if (error) showToast(error.message, "error");
}

async function logout() {
    if (state.supabase) await state.supabase.auth.signOut();
    state.session = null;
    state.user = null;
    state.role = "guest";
    updateAccountUI();
    updateCheckoutVisibility();
    showToast("Sesión cerrada.");
}

async function loadServices(showFeedback = false) {
    const list = byId("listaProductos");
    showLoading(list, "Cargando catálogo");

    try {
        const result = await api("/api/services");
        state.services = (result.services || []).map((service) => ({
            ...service,
            price: Number(service.price),
            stock: Number(service.stock)
        }));
        state.persistent = Boolean(result.persistent);
        byId("stockNotice").textContent = state.persistent
            ? "Stock conectado a la base de datos. Al actualizar el catálogo verás la existencia más reciente."
            : "Vista demostrativa: conecta Supabase para compartir el stock entre todos los visitantes.";
        reconcileCart();
        renderProducts();
        renderCart();
        if (state.role === "owner") renderAdminServices();
        if (showFeedback) showToast("Catálogo y stock actualizados.");
    } catch (error) {
        showEmpty(list, "No pudimos cargar el catálogo", error.message);
        showToast(error.message, "error");
    }
}

function reconcileCart() {
    const serviceIds = new Set(state.services.map((service) => service.id));
    state.cart = state.cart
        .filter((item) => serviceIds.has(item.id))
        .map((item) => {
            const service = state.services.find((entry) => entry.id === item.id);
            return { ...item, quantity: Math.min(item.quantity, service.stock) };
        })
        .filter((item) => item.quantity > 0);
    saveCart();
}

function normalized(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderProducts() {
    const list = byId("listaProductos");
    const query = normalized(byId("buscar").value.trim());
    const category = byId("filtroCategoria").value;
    const filtered = state.services.filter((service) => {
        const haystack = normalized(`${service.name} ${service.category} ${service.description}`);
        return (!query || haystack.includes(query)) && (!category || service.category === category);
    });

    list.replaceChildren();
    if (!filtered.length) {
        showEmpty(list, "No encontramos servicios", "Prueba con otra búsqueda o categoría.");
        return;
    }

    for (const service of filtered) {
        const card = makeElement("article", "product-card");
        const image = makeElement("img");
        image.src = service.image_path;
        image.alt = service.name;
        image.loading = "lazy";

        const content = makeElement("div", "product-content");
        const tags = makeElement("div", "product-tags");
        tags.append(makeElement("span", "badge", service.category));
        tags.append(makeElement("span", `stock-badge${service.stock <= 0 ? " empty" : ""}`, service.stock > 0 ? `Disponibles: ${service.stock}` : "Sin disponibilidad"));
        content.append(tags, makeElement("h3", "", service.name), makeElement("p", "", service.description));

        const footer = makeElement("div", "product-footer");
        footer.append(makeElement("span", "price", money(service.price)));
        const button = makeElement("button", "", service.stock > 0 ? "Agregar" : "Agotado");
        button.type = "button";
        button.disabled = service.stock <= 0;
        button.dataset.addService = service.id;
        footer.append(button);
        content.append(footer);
        card.append(image, content);
        list.append(card);
    }
}

function addToCart(serviceId) {
    const service = state.services.find((item) => item.id === serviceId);
    if (!service || service.stock <= 0) return;

    const existing = state.cart.find((item) => item.id === serviceId);
    if (existing) {
        if (existing.quantity >= service.stock) {
            showToast("Ya agregaste todo el stock disponible de este servicio.", "error");
            return;
        }
        existing.quantity += 1;
    } else {
        state.cart.push({ id: serviceId, quantity: 1 });
    }

    saveCart();
    renderCart();
    showToast(`${service.name} agregado al carrito.`);
}

function updateCartQuantity(serviceId, change) {
    const cartItem = state.cart.find((item) => item.id === serviceId);
    const service = state.services.find((item) => item.id === serviceId);
    if (!cartItem || !service) return;

    const nextQuantity = cartItem.quantity + change;
    if (nextQuantity <= 0) {
        state.cart = state.cart.filter((item) => item.id !== serviceId);
    } else if (nextQuantity <= service.stock) {
        cartItem.quantity = nextQuantity;
    } else {
        showToast("No hay más stock disponible.", "error");
    }
    saveCart();
    renderCart();
}

function renderCart() {
    const list = byId("listaCarrito");
    list.replaceChildren();
    let units = 0;
    let total = 0;

    for (const item of state.cart) {
        const service = state.services.find((entry) => entry.id === item.id);
        if (!service) continue;
        units += item.quantity;
        total += service.price * item.quantity;

        const row = makeElement("article", "cart-item");
        const image = makeElement("img");
        image.src = service.image_path;
        image.alt = "";
        const description = makeElement("div");
        description.append(makeElement("h3", "", service.name), makeElement("p", "", `${money(service.price)} por servicio`));

        const controls = makeElement("div", "quantity-control");
        const minus = makeElement("button", "", "−");
        minus.type = "button";
        minus.dataset.cartChange = "-1";
        minus.dataset.serviceId = service.id;
        minus.setAttribute("aria-label", `Quitar una unidad de ${service.name}`);
        const quantity = makeElement("strong", "", String(item.quantity));
        const plus = makeElement("button", "", "+");
        plus.type = "button";
        plus.dataset.cartChange = "1";
        plus.dataset.serviceId = service.id;
        plus.disabled = item.quantity >= service.stock;
        plus.setAttribute("aria-label", `Agregar una unidad de ${service.name}`);
        const remove = makeElement("button", "remove-button", "×");
        remove.type = "button";
        remove.dataset.removeService = service.id;
        remove.setAttribute("aria-label", `Eliminar ${service.name}`);
        controls.append(minus, quantity, plus, remove);
        row.append(image, description, controls);
        list.append(row);
    }

    if (!units) showEmpty(list, "Tu carrito está vacío", "Agrega un servicio desde el catálogo para comenzar.");

    byId("contadorCarrito").textContent = String(units);
    byId("cartUnits").textContent = String(units);
    byId("totalCarrito").textContent = money(total);
    byId("clearCartButton").disabled = units === 0;
    byId("checkoutButton").disabled = units === 0;
    updateCheckoutVisibility();
}

function updateCheckoutVisibility() {
    const signedIn = Boolean(state.session && state.user);
    byId("loginGate").classList.toggle("hidden", signedIn);
    byId("checkoutForm").classList.toggle("hidden", !signedIn);
}

function navigateTo(sectionId) {
    if (sectionId === "pedidos") {
        if (!state.session) {
            openLoginModal();
            return;
        }
        byId("pedidos").classList.remove("hidden");
        loadOrders();
    }

    if (sectionId === "admin") {
        if (state.role !== "owner") {
            showToast("Solo el propietario puede abrir este panel.", "error");
            return;
        }
        byId("admin").classList.remove("hidden");
        renderAdminServices();
    }

    if (sectionId === "carrito") byId("carrito").classList.remove("hidden");

    const target = byId(sectionId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll(".main-nav button").forEach((button) => {
        button.classList.toggle("active", button.dataset.sectionTarget === sectionId);
    });
    byId("accountMenu").classList.add("hidden");
}

function selectCategory(category) {
    byId("filtroCategoria").value = category === "Diagnóstico" ? "" : category;
    byId("buscar").value = category === "Diagnóstico" ? "diagnóstico" : "";
    renderProducts();
    navigateTo("catalogo");
}

function openLoginModal() {
    const modal = byId("loginModal");
    if (!modal.open) modal.showModal();
}

function setAppointmentDefaults() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    const localValue = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    byId("appointmentAt").min = localValue;
    byId("appointmentAt").value = localValue;
}

function formatCardNumber(value) {
    return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function updateCardPreview() {
    const number = byId("cardNumber").value;
    const name = byId("cardholder").value.trim();
    const expiry = byId("cardExpiry").value;
    byId("cardPreviewNumber").textContent = number || "•••• •••• •••• 4242";
    byId("cardPreviewName").textContent = name.toUpperCase() || "NOMBRE DEL CLIENTE";
    byId("cardPreviewExpiry").textContent = expiry || "MM/AA";
}

function validateTestCard() {
    const number = byId("cardNumber").value.replace(/\D/g, "");
    const expiry = byId("cardExpiry").value;
    const cvv = byId("cardCvv").value;

    if (number !== "4242424242424242") {
        throw new Error("Para protegerte, esta demo solo acepta la tarjeta ficticia 4242 4242 4242 4242.");
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) throw new Error("Escribe el vencimiento como MM/AA.");

    const [month, year] = expiry.split("/").map(Number);
    const expiration = new Date(2000 + year, month, 0, 23, 59, 59);
    if (month < 1 || month > 12 || expiration <= new Date()) throw new Error("Usa una fecha de vencimiento futura.");
    if (!/^\d{3,4}$/.test(cvv)) throw new Error("El CVV ficticio debe tener 3 o 4 dígitos.");
    return { brand: "Visa de prueba", last4: "4242" };
}

async function submitCheckout(event) {
    event.preventDefault();
    if (!state.session) return openLoginModal();
    if (!state.persistent) {
        showToast("Conecta Supabase para guardar la cita y actualizar el stock compartido.", "error");
        return;
    }
    if (!state.cart.length) {
        showToast("El carrito está vacío.", "error");
        return;
    }

    const button = byId("checkoutButton");
    try {
        const payment = validateTestCard();
        button.disabled = true;
        button.textContent = "Confirmando cita…";

        const receipt = await api("/api/orders", {
            method: "POST",
            body: JSON.stringify({
                items: state.cart,
                appointmentAt: new Date(byId("appointmentAt").value).toISOString(),
                deviceModel: byId("deviceModel").value,
                phone: byId("customerPhone").value,
                notes: byId("appointmentNotes").value,
                paymentBrand: payment.brand,
                paymentLast4: payment.last4
            })
        });

        state.cart = [];
        saveCart();
        renderReceipt(receipt);
        byId("receiptModal").showModal();
        byId("checkoutForm").reset();
        setAppointmentDefaults();
        updateCardPreview();
        await loadServices();
        showToast("Cita presencial agendada y factura generada.");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        button.textContent = "Confirmar cita y generar factura";
        button.disabled = state.cart.length === 0;
    }
}

function normalizeReceipt(order) {
    return {
        receiptNumber: order.receiptNumber || order.receipt_number,
        customerEmail: order.customerEmail || order.customer_email || state.user?.email || "",
        total: Number(order.total),
        appointmentAt: order.appointmentAt || order.appointment_at,
        deviceModel: order.deviceModel || order.device_model,
        phone: order.phone || "",
        status: order.status,
        paymentBrand: order.paymentBrand || order.payment_brand,
        paymentLast4: order.paymentLast4 || order.payment_last4,
        createdAt: order.createdAt || order.created_at,
        items: (order.items || order.order_items || []).map((item) => ({
            name: item.name || item.service_name,
            unitPrice: Number(item.unitPrice ?? item.unit_price),
            quantity: Number(item.quantity),
            lineTotal: Number(item.lineTotal ?? item.line_total)
        }))
    };
}

function renderReceipt(rawOrder) {
    const receipt = normalizeReceipt(rawOrder);
    const container = byId("receiptContent");
    container.replaceChildren();

    const header = makeElement("div", "receipt-header");
    const brand = makeElement("div");
    brand.append(makeElement("h2", "", "RSF-PHONE"), makeElement("p", "", "Factura / recibo de prueba"));
    const number = makeElement("div");
    number.append(makeElement("strong", "", receipt.receiptNumber), makeElement("p", "", DATE_TIME.format(new Date(receipt.createdAt))));
    header.append(brand, number);

    const meta = makeElement("div", "receipt-meta");
    const metaData = [
        ["Cliente", receipt.customerEmail],
        ["Dispositivo", receipt.deviceModel],
        ["Cita presencial", DATE_TIME.format(new Date(receipt.appointmentAt))],
        ["Pago simulado", `${receipt.paymentBrand} •••• ${receipt.paymentLast4}`]
    ];
    for (const [label, value] of metaData) {
        const cell = makeElement("div");
        cell.append(makeElement("span", "", label), makeElement("strong", "", value));
        meta.append(cell);
    }

    const table = makeElement("table", "receipt-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Servicio", "Cant.", "Subtotal"].forEach((label) => headRow.append(makeElement("th", "", label)));
    head.append(headRow);
    const body = document.createElement("tbody");
    receipt.items.forEach((item) => {
        const row = document.createElement("tr");
        row.append(makeElement("td", "", item.name), makeElement("td", "", String(item.quantity)), makeElement("td", "", money(item.lineTotal)));
        body.append(row);
    });
    table.append(head, body);

    const total = makeElement("div", "receipt-total");
    total.append(makeElement("span", "", "Total simulado"), makeElement("span", "", money(receipt.total)));
    const confirmation = makeElement("div", "receipt-confirmation");
    confirmation.append(makeElement("strong", "", "✓ Cita presencial agendada"), makeElement("p", "", `Te esperamos el ${DATE_TIME.format(new Date(receipt.appointmentAt))}. Este comprobante no representa un cobro real.`));
    container.append(header, meta, table, total, confirmation);
}

async function loadOrders() {
    const container = byId("ordersContent");
    showLoading(container, "Cargando tus citas");
    try {
        const orders = await api("/api/orders");
        renderOrders(container, orders, false);
    } catch (error) {
        showEmpty(container, "No pudimos cargar tus citas", error.message);
    }
}

function renderOrders(container, orders, adminMode) {
    container.replaceChildren();
    if (!orders.length) {
        showEmpty(container, "Todavía no hay citas", adminMode ? "Las reservas aparecerán aquí." : "Tu primera reserva aparecerá aquí con su factura.");
        return;
    }

    orders.forEach((rawOrder) => {
        const order = normalizeReceipt(rawOrder);
        const card = makeElement("article", "order-card");
        const header = makeElement("div", "order-card-header");
        const title = makeElement("div");
        title.append(makeElement("h3", "", order.receiptNumber), makeElement("p", "", adminMode ? order.customerEmail : order.deviceModel));
        const status = makeElement("span", `status-badge ${order.status}`, STATUS_LABELS[order.status] || order.status);
        header.append(title, status);

        const details = makeElement("div", "order-details");
        [["Cita", DATE_TIME.format(new Date(order.appointmentAt))], ["Dispositivo", order.deviceModel], ["Total", money(order.total)]].forEach(([label, value]) => {
            const cell = makeElement("div");
            cell.append(makeElement("span", "", label), makeElement("strong", "", value));
            details.append(cell);
        });

        const actions = makeElement("div", "admin-row-actions");
        const receiptButton = makeElement("button", "", "Ver factura");
        receiptButton.type = "button";
        receiptButton.addEventListener("click", () => {
            renderReceipt(rawOrder);
            byId("receiptModal").showModal();
        });
        actions.append(receiptButton);

        if (adminMode) {
            const select = document.createElement("select");
            select.dataset.orderStatus = rawOrder.id;
            Object.entries(STATUS_LABELS).forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = value === order.status;
                select.append(option);
            });
            actions.append(select);
        }

        card.append(header, details, actions);
        container.append(card);
    });
}

function renderAdminServices() {
    if (state.role !== "owner") return;
    const container = byId("adminServiceList");
    container.replaceChildren();
    state.services.forEach((service) => {
        const row = makeElement("article", "admin-row");
        const header = makeElement("div", "admin-row-header");
        const content = makeElement("div");
        content.append(makeElement("h3", "", service.name), makeElement("p", "", `${service.category} · ${money(service.price)} · Stock: ${service.stock}`));
        const actions = makeElement("div", "admin-row-actions");
        const edit = makeElement("button", "", "Editar");
        edit.type = "button";
        edit.dataset.editService = service.id;
        const hide = makeElement("button", "danger", "Ocultar");
        hide.type = "button";
        hide.dataset.hideService = service.id;
        actions.append(edit, hide);
        header.append(content, actions);
        row.append(header);
        container.append(row);
    });
}

function editService(serviceId) {
    const service = state.services.find((item) => item.id === serviceId);
    if (!service) return;
    byId("serviceId").value = service.id;
    byId("serviceName").value = service.name;
    byId("serviceCategory").value = service.category;
    byId("serviceDescription").value = service.description;
    byId("servicePrice").value = service.price;
    byId("serviceStock").value = service.stock;
    byId("serviceImage").value = service.image_path;
    byId("serviceFormTitle").textContent = "Editar servicio";
    byId("cancelServiceEdit").classList.remove("hidden");
    byId("serviceForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetServiceForm() {
    byId("serviceForm").reset();
    byId("serviceId").value = "";
    byId("serviceFormTitle").textContent = "Agregar servicio";
    byId("cancelServiceEdit").classList.add("hidden");
}

async function submitService(event) {
    event.preventDefault();
    const id = byId("serviceId").value;
    const body = {
        name: byId("serviceName").value,
        category: byId("serviceCategory").value,
        description: byId("serviceDescription").value,
        price: Number(byId("servicePrice").value),
        stock: Number(byId("serviceStock").value),
        imagePath: byId("serviceImage").value
    };

    try {
        await api(id ? `/api/services/${id}` : "/api/services", {
            method: id ? "PATCH" : "POST",
            body: JSON.stringify(body)
        });
        resetServiceForm();
        await loadServices();
        showToast(id ? "Servicio actualizado." : "Servicio creado.");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function hideService(serviceId) {
    const service = state.services.find((item) => item.id === serviceId);
    if (!service || !window.confirm(`¿Ocultar “${service.name}” del catálogo?`)) return;
    try {
        await api(`/api/services/${serviceId}`, { method: "DELETE" });
        await loadServices();
        showToast("Servicio ocultado del catálogo.");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function loadAdminOrders() {
    const container = byId("adminOrdersList");
    showLoading(container, "Cargando citas de clientes");
    try {
        const orders = await api("/api/admin/orders");
        renderOrders(container, orders, true);
    } catch (error) {
        showEmpty(container, "No pudimos cargar las citas", error.message);
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await api(`/api/admin/orders/${orderId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });
        showToast("Estado de la cita actualizado.");
        await loadAdminOrders();
    } catch (error) {
        showToast(error.message, "error");
    }
}

function bindEvents() {
    document.addEventListener("click", (event) => {
        const sectionButton = event.target.closest("[data-section-target]");
        if (sectionButton) navigateTo(sectionButton.dataset.sectionTarget);

        const categoryButton = event.target.closest("[data-category]");
        if (categoryButton) selectCategory(categoryButton.dataset.category);

        const addButton = event.target.closest("[data-add-service]");
        if (addButton) addToCart(addButton.dataset.addService);

        const cartButton = event.target.closest("[data-cart-change]");
        if (cartButton) updateCartQuantity(cartButton.dataset.serviceId, Number(cartButton.dataset.cartChange));

        const removeButton = event.target.closest("[data-remove-service]");
        if (removeButton) {
            state.cart = state.cart.filter((item) => item.id !== removeButton.dataset.removeService);
            saveCart();
            renderCart();
        }

        const loginButton = event.target.closest("[data-login-google]");
        if (loginButton) loginWithGoogle();

        const closeButton = event.target.closest("[data-close-modal]");
        if (closeButton) closeButton.closest("dialog")?.close();

        const editButton = event.target.closest("[data-edit-service]");
        if (editButton) editService(editButton.dataset.editService);

        const hideButton = event.target.closest("[data-hide-service]");
        if (hideButton) hideService(hideButton.dataset.hideService);
    });

    document.addEventListener("change", (event) => {
        if (event.target.matches("[data-order-status]")) updateOrderStatus(event.target.dataset.orderStatus, event.target.value);
    });

    byId("buscar").addEventListener("input", renderProducts);
    byId("filtroCategoria").addEventListener("change", renderProducts);
    byId("refreshCatalogButton").addEventListener("click", () => loadServices(true));
    byId("loginButton").addEventListener("click", openLoginModal);
    byId("logoutButton").addEventListener("click", logout);
    byId("profileButton").addEventListener("click", () => {
        const menu = byId("accountMenu");
        menu.classList.toggle("hidden");
        byId("profileButton").setAttribute("aria-expanded", String(!menu.classList.contains("hidden")));
    });
    byId("clearCartButton").addEventListener("click", () => {
        if (!state.cart.length || !window.confirm("¿Vaciar el carrito?")) return;
        state.cart = [];
        saveCart();
        renderCart();
    });
    byId("checkoutForm").addEventListener("submit", submitCheckout);
    byId("refreshOrdersButton").addEventListener("click", loadOrders);
    byId("serviceForm").addEventListener("submit", submitService);
    byId("cancelServiceEdit").addEventListener("click", resetServiceForm);
    byId("printReceiptButton").addEventListener("click", () => window.print());
    byId("fillTestCardButton").addEventListener("click", () => {
        byId("cardNumber").value = "4242 4242 4242 4242";
        byId("cardCvv").value = "123";
        const futureYear = String(new Date().getFullYear() + 2).slice(-2);
        byId("cardExpiry").value = `12/${futureYear}`;
        updateCardPreview();
    });
    byId("cardNumber").addEventListener("input", (event) => {
        event.target.value = formatCardNumber(event.target.value);
        updateCardPreview();
    });
    byId("cardExpiry").addEventListener("input", (event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
        event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
        updateCardPreview();
    });
    byId("cardholder").addEventListener("input", updateCardPreview);
    byId("cardCvv").addEventListener("input", (event) => {
        event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
    });

    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-admin-tab]").forEach((entry) => entry.classList.toggle("active", entry === button));
            const appointments = button.dataset.adminTab === "appointments";
            byId("adminProductsPanel").classList.toggle("hidden", appointments);
            byId("adminAppointmentsPanel").classList.toggle("hidden", !appointments);
            if (appointments) loadAdminOrders();
        });
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".account-wrap")) byId("accountMenu").classList.add("hidden");
    });
}

async function initialize() {
    bindEvents();
    setAppointmentDefaults();
    renderCart();
    await Promise.all([loadConfiguration(), loadServices()]);
}

initialize();
