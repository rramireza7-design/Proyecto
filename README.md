# RSF-PHONE

Aplicación web para mostrar servicios de reparación, iniciar sesión con Google, reservar citas presenciales, generar facturas de prueba y administrar catálogo, stock y citas desde una cuenta de propietario.

## Funciones

- Catálogo público con búsqueda, categorías e imágenes optimizadas para tarjetas.
- Carrito disponible sin iniciar sesión.
- Acceso y creación de cuenta mediante Google.
- Compra completamente simulada: solo acepta `4242 4242 4242 4242` y nunca envía el número ni el CVV al servidor.
- Factura/recibo imprimible y confirmación de cita presencial.
- Stock compartido y persistente en Supabase; se descuenta en una transacción al confirmar la cita.
- Cuenta de propietario protegida en el servidor para crear, editar y ocultar servicios, cambiar stock y administrar citas.
- Clientes limitados a su carrito, compras y citas.

## Configurar Supabase (plan gratuito)

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. Abre **SQL Editor**, pega todo el contenido de `supabase/schema.sql` y ejecútalo. Esto crea tablas, reglas de seguridad, datos iniciales y la función transaccional de compra.
3. En **Authentication > Providers > Google**, habilita Google y agrega el Client ID y Client Secret de Google Cloud.
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
| `OWNER_EMAIL` | Correo de Google del propietario |

La clave `service_role` nunca debe copiarse al navegador ni guardarse en GitHub. El servidor solo expone la clave pública `anon`.

Después de guardar las variables, usa **Save, rebuild, and deploy**. El correo configurado en `OWNER_EMAIL` obtendrá el rol de propietario al iniciar sesión con Google; los demás usuarios serán clientes.

## Desarrollo y pruebas

Requiere Node.js 20 o superior.

```bash
npm ci
npm test
npm start
```

La aplicación abre en `http://localhost:3000`. Sin variables de Supabase mostrará el catálogo en modo demostración, pero bloqueará autenticación y compras para no fingir persistencia.

## Seguridad del flujo de pago

Este proyecto no es una pasarela de pago. La interfaz solo acepta una tarjeta de prueba conocida. Al servidor llegan únicamente la marca de prueba y los últimos cuatro dígitos; nunca se envían ni almacenan el número completo, el vencimiento o el CVV.
