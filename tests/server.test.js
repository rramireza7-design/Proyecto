const test = require("node:test");
const assert = require("node:assert/strict");

process.env.OWNER_USERNAME = "admin";
process.env.OWNER_PASSWORD = "contrasena-local-segura";
process.env.SESSION_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";

const { app, consolidateItems, createSlug, validateServiceInput } = require("../server");

let server;
let baseUrl;

test.before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, "127.0.0.1", () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
});

test("consolidateItems agrupa servicios repetidos", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    assert.deepEqual(consolidateItems([{ id, quantity: 1 }, { id, quantity: 2 }]), [{ id, quantity: 3 }]);
});

test("consolidateItems rechaza identificadores inválidos", () => {
    assert.throws(() => consolidateItems([{ id: "pantalla", quantity: 1 }]), /servicio inválido/);
});

test("validateServiceInput normaliza datos del catálogo", () => {
    const service = validateServiceInput({
        name: "  Reparación rápida  ",
        category: "Software",
        description: "Descripción suficientemente detallada",
        price: "125.50",
        stock: "4",
        imagePath: "img/servicio-software.png"
    });

    assert.equal(service.slug, "reparacion-rapida");
    assert.equal(service.price, 125.5);
    assert.equal(service.stock, 4);
    assert.equal(service.image_path, "/img/servicio-software.png");
});

test("GET /api/health informa el estado del servidor", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.authConfigured, "boolean");
    assert.equal(body.localOwnerConfigured, true);
});

test("el propietario puede iniciar y cerrar una sesión local segura", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/local/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "contrasena-local-segura" })
    });
    const loginBody = await loginResponse.json();
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];

    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.role, "owner");
    assert.equal(loginBody.authType, "local");
    assert.match(cookie, /^rsf_owner_session=/);

    const meResponse = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } });
    const me = await meResponse.json();
    assert.equal(meResponse.status, 200);
    assert.equal(me.name, "admin");
    assert.equal(me.role, "owner");
    assert.equal(me.authType, "local");

    const logoutResponse = await fetch(`${baseUrl}/api/auth/local/logout`, {
        method: "POST",
        headers: { Cookie: cookie }
    });
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);
});

test("GET /api/services entrega el catálogo de respaldo sin credenciales", async () => {
    const response = await fetch(`${baseUrl}/api/services`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.persistent, false);
    assert.equal(body.services.length, 6);
    assert.match(body.services[0].image_path, /^\/img\/servicio-/);
});

test("los recursos principales y sus imágenes responden", async () => {
    for (const resource of ["/", "/css/estilos.css", "/js/script.js", "/img/servicio-pantalla.png", "/vendor/supabase.js"]) {
        const response = await fetch(`${baseUrl}${resource}`);
        assert.equal(response.status, 200, resource);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
});

test("los archivos internos no se sirven públicamente", async () => {
    for (const resource of ["/server.js", "/package.json", "/.env.example", "/supabase/schema.sql"]) {
        const response = await fetch(`${baseUrl}${resource}`);
        assert.equal(response.status, 404, resource);
    }
});

test("las rutas privadas rechazan solicitudes sin sesión", async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] })
    });
    assert.equal(response.status, 401);
});
