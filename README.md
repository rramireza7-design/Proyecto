# RSF-PHONE

Aplicación web para mostrar servicios de reparación, registrar clientes, iniciar sesión con correo o Google, reservar citas presenciales, generar facturas de prueba y administrar catálogo, stock y citas desde una cuenta local de propietario.

## Funciones

- Catálogo público con búsqueda, categorías e imágenes optimizadas para tarjetas.
- Carrito disponible sin iniciar sesión.
- Acceso de clientes con correo/contraseña o Google y formulario para crear cuenta.
- Compra completamente simulada: solo acepta `4242 4242 4242 4242` y nunca envía el número ni el CVV al servidor.
- Factura/recibo imprimible y confirmación de cita presencial.
- Stock compartido y persistente en Supabase; se descuenta en una transacción al confirmar la cita.
- Cuenta local de propietario protegida por cookie segura para crear, editar y ocultar servicios, cambiar stock y administrar citas.
- Carga de fotos JPG, PNG o WebP desde el panel del propietario, con vista previa y almacenamiento persistente en Supabase Storage.
- Clientes limitados a su carrito, compras y citas.

## Configurar Supabase (plan gratuito)

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. Abre **SQL Editor**, pega todo el contenido de `supabase/schema.sql` y ejecútalo. Esto crea tablas, reglas de seguridad, datos iniciales y la función transaccional de compra.
3. En **Authentication > Providers**, deja activo Email y habilita Google con el Client ID y Client Secret de Google Cloud.
4. En Google Cloud crea un cliente OAuth de tipo **Web application**:
   - Authorized JavaScript origin: `https://rsf-phone.onrender.com`
   - Authorized redirect URI: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
5. En **Supabase > Authentication > URL Configuration** usa:
   - Site URL: `https://rsf-phone.onrender.com`
   - Redirect URLs: `https://rsf-phone.onrender.com/**` y, para desarrollo, `http://localhost:3000/**`

## Variables en Render

En el servicio `rsf-phone`, abre **Environment** y agrega:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Clave pública `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada `service_role` |
| `OWNER_USERNAME` | Usuario local del propietario; recomendado: `admin` |
| `OWNER_PASSWORD` | Contraseña única del propietario, mínimo 12 caracteres |
| `SESSION_SECRET` | Valor aleatorio de mínimo 32 caracteres; Render puede generarlo |

La clave `service_role`, la contraseña del propietario y `SESSION_SECRET` nunca deben guardarse en GitHub. El servidor solo expone la clave pública `anon`.

Después de guardar las variables, usa **Save, rebuild, and deploy**. El propietario entra con `OWNER_USERNAME` y `OWNER_PASSWORD`; no necesita Google. Las cuentas creadas con correo o Google siempre comienzan como clientes.

## Desarrollo y pruebas

Requiere Node.js 20 o superior.

```bash
npm ci
npm test
npm start
```

La aplicación abre en `http://localhost:3000`. El catálogo seguirá visible aunque falten variables; las funciones que necesitan autenticación o persistencia mostrarán el error únicamente cuando el usuario intente utilizarlas, sin avisos globales en la página.

## Seguridad del flujo de pago

Este proyecto no es una pasarela de pago. La interfaz solo acepta una tarjeta de prueba conocida. Al servidor llegan únicamente la marca de prueba y los últimos cuatro dígitos; nunca se envían ni almacenan el número completo, el vencimiento o el CVV.
