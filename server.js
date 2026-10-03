const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const fallbackServices = require("./data/services.json");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const OWNER_USERNAME = normalizeCredential(process.env.OWNER_USERNAME || "admin");
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const databaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const authConfigured = Boolean(databaseConfigured && SUPABASE_ANON_KEY);
const localOwnerConfigured = Boolean(OWNER_USERNAME && OWNER_PASSWORD.length >= 12 && SESSION_SECRET.length >= 32);
const ownerLoginAttempts = new Map();
const SERVICE_IMAGES_BUCKET = "service-images";
const MAX_SERVICE_IMAGE_BYTES = 5 * 1024 * 1024;
const SERVICE_IMAGE_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
]);

let adminClient;

function getAdminClient() {
    if (!databaseConfigured) return null;

    if (!adminClient) {
        adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }

    return adminClient;
}

function normalizeCredential(value) {
    return typeof value === "string" ? value.trim().toLowerCase().slice(0, 80) : "";
}

function safeEqual(left, right) {
    const leftHash = crypto.createHash("sha256").update(String(left)).digest();
    const rightHash = crypto.createHash("sha256").update(String(right)).digest();
    return crypto.timingSafeEqual(leftHash, rightHash);
}

function signOwnerSession() {
    const payload = Buffer.from(JSON.stringify({
        sub: "local-owner",
        username: OWNER_USERNAME,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60)
    })).toString("base64url");
    const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

function verifyOwnerSession(token) {
    if (!localOwnerConfigured || typeof token !== "string") return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (!safeEqual(signature, expected)) return null;

    try {
        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (decoded.sub !== "local-owner" || decoded.role !== "owner" || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
        return decoded;
    } catch {
        return null;
    }
}

function readCookie(req, name) {
    const cookieHeader = req.get("cookie") || "";
    const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function ownerCookie(token, maxAge = 8 * 60 * 60) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `rsf_owner_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function ownerLoginRateLimit(req, res, next) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const record = ownerLoginAttempts.get(key);

    if (!record || record.resetAt <= now) {
        ownerLoginAttempts.set(key, { count: 1, resetAt: now + (15 * 60 * 1000) });
        return next();
    }

    if (record.count >= 10) {
        res.setHeader("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
        return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos antes de volver a intentar." });
    }

    record.count += 1;
    next();
}

app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-src https://accounts.google.com https://*.supabase.co; base-uri 'self'; form-action 'self'"
    );
    next();
});
app.use(express.json({ limit: "100kb" }));

function normalizeText(value, maxLength = 500) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createSlug(value) {
    return normalizeText(value, 80)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60);
}

function normalizeImagePath(value) {
    const imagePath = normalizeText(value, 255);
    const localImage = /^\/?img\/[a-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(imagePath);
    const remoteImage = /^https:\/\/[a-z0-9.-]+\/[\w./%-]+(?:\?.*)?$/i.test(imagePath);

    if (!localImage && !remoteImage) {
        throw new Error("La ruta de imagen no es válida.");
    }

    return imagePath.startsWith("/") || remoteImage ? imagePath : `/${imagePath}`;
}

function isSupportedImage(buffer, contentType) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12 || !SERVICE_IMAGE_TYPES.has(contentType)) return false;
    if (contentType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

async function ensureServiceImagesBucket() {
    const storage = getAdminClient().storage;
    const { data: bucket } = await storage.getBucket(SERVICE_IMAGES_BUCKET);

    if (!bucket) {
        const { error } = await storage.createBucket(SERVICE_IMAGES_BUCKET, {
            public: true,
            fileSizeLimit: MAX_SERVICE_IMAGE_BYTES,
            allowedMimeTypes: [...SERVICE_IMAGE_TYPES.keys()]
        });
        if (error && !/already exists/i.test(error.message || "")) throw error;
        return;
    }

    if (!bucket.public) {
        const { error } = await storage.updateBucket(SERVICE_IMAGES_BUCKET, {
            public: true,
            fileSizeLimit: MAX_SERVICE_IMAGE_BYTES,
            allowedMimeTypes: [...SERVICE_IMAGE_TYPES.keys()]
        });
        if (error) throw error;
    }
}

function validateServiceInput(body = {}) {
    const name = normalizeText(body.name, 90);
    const category = normalizeText(body.category, 60);
    const description = normalizeText(body.description, 800);
    const price = Number(body.price);
    const stock = Number(body.stock);
    const imagePath = normalizeImagePath(body.imagePath || body.image_path || "");

    if (name.length < 3 || category.length < 3 || description.length < 10) {
        throw new Error("Completa nombre, categoría y una descripción válida.");
    }
    if (!Number.isFinite(price) || price <= 0 || price > 100000) {
        throw new Error("El precio debe ser un número mayor que cero.");
    }
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
        throw new Error("El stock debe ser un número entero igual o mayor que cero.");
    }

    return {
        name,
        slug: createSlug(name),
        category,
        description,
        price: Number(price.toFixed(2)),
        stock,
        image_path: imagePath,
        active: body.active !== false
    };
}

function consolidateItems(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
        throw new Error("El carrito debe contener entre 1 y 20 servicios.");
    }

    const quantities = new Map();

    for (const item of items) {
        const id = normalizeText(item?.id, 50);
        const quantity = Number(item?.quantity || 1);

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
            throw new Error("El carrito contiene un servicio inválido.");
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
            throw new Error("La cantidad solicitada no es válida.");
        }

        quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    const normalized = [...quantities].map(([id, quantity]) => ({ id, quantity }));
    if (normalized.reduce((sum, item) => sum + item.quantity, 0) > 20) {
        throw new Error("El carrito no puede superar 20 servicios.");
    }

    return normalized;
}

async function authenticate(req, res, next) {
    const ownerSession = verifyOwnerSession(readCookie(req, "rsf_owner_session"));
    if (ownerSession) {
        req.user = {
            id: "local-owner",
            email: "",
            user_metadata: { name: OWNER_USERNAME }
        };
        req.role = "owner";
        req.authType = "local";
        return next();
    }

    const authorization = req.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) {
        return res.status(401).json({ error: "Debes iniciar sesión." });
    }
    if (!authConfigured) {
        return res.status(503).json({ error: "El acceso de clientes todavía no está configurado." });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        return res.status(401).json({ error: "Tu sesión venció. Inicia sesión nuevamente." });
    }

    const user = data.user;
    const email = (user.email || "").toLowerCase();
    const metadata = user.user_metadata || {};
    const { data: existingProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
    const role = existingProfile?.role === "owner" ? "owner" : "customer";

    await supabase.from("profiles").upsert({
        id: user.id,
        email,
        display_name: normalizeText(metadata.full_name || metadata.name || email.split("@")[0], 120),
        avatar_url: normalizeText(metadata.avatar_url || metadata.picture, 500),
        role,
        updated_at: new Date().toISOString()
    }, { onConflict: "id" });

    req.user = user;
    req.role = role;
    req.authType = "supabase";
    next();
}

function requireOwner(req, res, next) {
    if (req.role !== "owner") {
        return res.status(403).json({ error: "Esta acción está reservada para el propietario." });
    }
    next();
}

function requireCustomer(req, res, next) {
    if (req.authType !== "supabase") {
        return res.status(403).json({ error: "Para reservar, entra como cliente con correo o Google." });
    }
    next();
}

function requireDatabase(req, res, next) {
    if (!databaseConfigured) {
        return res.status(503).json({ error: "La base de datos todavía no está configurada." });
    }
    next();
}

app.get("/api/health", (req, res) => {
    res.json({ ok: true, databaseConfigured, authConfigured, localOwnerConfigured, timestamp: new Date().toISOString() });
});

app.get("/api/config", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, authConfigured, localOwnerConfigured });
});

app.get("/api/services", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    if (!databaseConfigured) {
        return res.json({ services: fallbackServices, persistent: false });
    }

    const { data, error } = await getAdminClient()
        .from("services")
        .select("id,slug,name,category,description,price,stock,image_path,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (error) {
        console.error("No se pudo consultar servicios:", error.message);
        return res.status(500).json({ error: "No se pudo cargar el catálogo." });
    }
    res.json({ services: data, persistent: true });
});

app.post("/api/auth/local/login", ownerLoginRateLimit, (req, res) => {
    if (!localOwnerConfigured) {
        return res.status(503).json({ error: "El acceso del propietario todavía no está configurado." });
    }

    const username = normalizeCredential(req.body.username);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!safeEqual(username, OWNER_USERNAME) || !safeEqual(password, OWNER_PASSWORD)) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    ownerLoginAttempts.delete(req.ip || "unknown");
    res.setHeader("Set-Cookie", ownerCookie(signOwnerSession()));
    res.json({ name: OWNER_USERNAME, email: "", role: "owner", authType: "local" });
});

app.post("/api/auth/local/logout", (req, res) => {
    res.setHeader("Set-Cookie", ownerCookie("", 0));
    res.json({ ok: true });
});

app.get("/api/me", authenticate, (req, res) => {
    const metadata = req.user.user_metadata || {};
    res.json({
        id: req.user.id,
        email: req.user.email,
        name: metadata.full_name || metadata.name || req.user.email,
        avatarUrl: metadata.avatar_url || metadata.picture || "",
        role: req.role,
        authType: req.authType
    });
});

app.post(
    "/api/admin/service-images",
    authenticate,
    requireOwner,
    requireDatabase,
    express.raw({ type: [...SERVICE_IMAGE_TYPES.keys()], limit: MAX_SERVICE_IMAGE_BYTES }),
    async (req, res) => {
        try {
            const contentType = (req.get("content-type") || "").split(";")[0].trim().toLowerCase();
            if (!isSupportedImage(req.body, contentType)) {
                return res.status(415).json({ error: "Selecciona una imagen JPG, PNG o WebP válida." });
            }

            await ensureServiceImagesBucket();
            const extension = SERVICE_IMAGE_TYPES.get(contentType);
            const objectPath = `services/${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const { error } = await getAdminClient().storage
                .from(SERVICE_IMAGES_BUCKET)
                .upload(objectPath, req.body, { contentType, cacheControl: "31536000", upsert: false });
            if (error) throw error;

            const { data } = getAdminClient().storage.from(SERVICE_IMAGES_BUCKET).getPublicUrl(objectPath);
            res.status(201).json({ imagePath: data.publicUrl });
        } catch (error) {
            console.error("No se pudo subir la imagen:", error.message);
            res.status(400).json({ error: "No se pudo guardar la imagen. Intenta nuevamente." });
        }
    }
);

app.post("/api/services", authenticate, requireOwner, requireDatabase, async (req, res) => {
    try {
        const service = validateServiceInput(req.body);
        const { data, error } = await getAdminClient().from("services").insert(service).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(error.code === "23505" ? 409 : 400).json({ error: error.message || "No se pudo crear el servicio." });
    }
});

app.patch("/api/services/:id", authenticate, requireOwner, requireDatabase, async (req, res) => {
    try {
        const service = validateServiceInput(req.body);
        const { data, error } = await getAdminClient()
            .from("services")
            .update({ ...service, updated_at: new Date().toISOString() })
            .eq("id", req.params.id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(error.code === "PGRST116" ? 404 : 400).json({ error: error.message || "No se pudo actualizar el servicio." });
    }
});

app.delete("/api/services/:id", authenticate, requireOwner, requireDatabase, async (req, res) => {
    const { data, error } = await getAdminClient()
        .from("services")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select("id")
        .single();

    if (error) return res.status(400).json({ error: "No se pudo ocultar el servicio." });
    res.json({ ok: true, id: data.id });
});

app.post("/api/orders", authenticate, requireCustomer, requireDatabase, async (req, res) => {
    try {
        const items = consolidateItems(req.body.items);
        const appointmentAt = new Date(req.body.appointmentAt);
        const deviceModel = normalizeText(req.body.deviceModel, 120);
        const phone = normalizeText(req.body.phone, 30);
        const notes = normalizeText(req.body.notes, 600);
        const paymentBrand = normalizeText(req.body.paymentBrand, 30);
        const paymentLast4 = normalizeText(req.body.paymentLast4, 4);
        const earliestAppointment = Date.now() + (60 * 60 * 1000);
        const latestAppointment = Date.now() + (180 * 24 * 60 * 60 * 1000);

        if (!Number.isFinite(appointmentAt.getTime()) || appointmentAt.getTime() < earliestAppointment || appointmentAt.getTime() > latestAppointment) {
            throw new Error("Selecciona una cita válida entre mañana y los próximos seis meses.");
        }
        if (deviceModel.length < 2 || !/^[+()\d\s-]{8,30}$/.test(phone)) {
            throw new Error("Completa el modelo del dispositivo y un teléfono válido.");
        }
        if (!/^\d{4}$/.test(paymentLast4)) {
            throw new Error("La referencia de pago no es válida.");
        }

        const { data, error } = await getAdminClient().rpc("create_service_order", {
            p_user_id: req.user.id,
            p_customer_email: req.user.email,
            p_items: items,
            p_appointment_at: appointmentAt.toISOString(),
            p_device_model: deviceModel,
            p_phone: phone,
            p_notes: notes,
            p_payment_brand: paymentBrand || "Tarjeta de prueba",
            p_payment_last4: paymentLast4
        });
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error("No se pudo crear el pedido:", error.message);
        res.status(400).json({ error: error.message || "No se pudo completar la compra simulada." });
    }
});

app.get("/api/orders", authenticate, requireCustomer, requireDatabase, async (req, res) => {
    const { data, error } = await getAdminClient()
        .from("orders")
        .select("id,receipt_number,total,appointment_at,device_model,status,payment_brand,payment_last4,created_at,order_items(service_name,unit_price,quantity,line_total)")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) return res.status(500).json({ error: "No se pudieron cargar tus citas." });
    res.json(data);
});

app.get("/api/admin/orders", authenticate, requireOwner, requireDatabase, async (req, res) => {
    const { data, error } = await getAdminClient()
        .from("orders")
        .select("id,receipt_number,customer_email,total,appointment_at,device_model,phone,notes,status,payment_brand,payment_last4,created_at,order_items(service_name,unit_price,quantity,line_total)")
        .order("appointment_at", { ascending: true })
        .limit(100);

    if (error) return res.status(500).json({ error: "No se pudieron cargar las citas." });
    res.json(data);
});

app.patch("/api/admin/orders/:id/status", authenticate, requireOwner, requireDatabase, async (req, res) => {
    const status = normalizeText(req.body.status, 20);
    const allowedStatuses = ["scheduled", "confirmed", "completed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "El estado de la cita no es válido." });
    }

    const { data, error } = await getAdminClient()
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select("id,status")
        .single();

    if (error) return res.status(400).json({ error: "No se pudo actualizar la cita." });
    res.json(data);
});

app.get("/vendor/supabase.js", (req, res) => {
    res.sendFile(path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"));
});

const assetOptions = {
    etag: true,
    maxAge: 0,
    setHeaders(res) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
};

app.use("/css", express.static(path.join(__dirname, "css"), assetOptions));
app.use("/js", express.static(path.join(__dirname, "js"), assetOptions));
app.use("/img", express.static(path.join(__dirname, "img"), {
    etag: true,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

app.post("/", (req, res) => {
    res.redirect(303, "/?actualiza=1");
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
    console.error(error);
    if (error?.type === "entity.too.large") {
        return res.status(413).json({ error: "La imagen no puede superar 5 MB." });
    }
    res.status(500).json({ error: "Ocurrió un error inesperado." });
});

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`RSF-PHONE disponible en el puerto ${PORT}`);
        console.log(`Supabase: ${authConfigured ? "configurado" : "pendiente de configurar"}`);
    });
}

module.exports = { app, consolidateItems, createSlug, isSupportedImage, validateServiceInput };
