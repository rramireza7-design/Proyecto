# Seguridad de RSF-PHONE

## Controles implementados

- Google OAuth mediante Supabase con flujo PKCE y alcance limitado a `openid`, correo y perfil.
- Las cuentas de Supabase siempre son clientes; únicamente la sesión local del propietario puede administrar.
- Cookie del propietario firmada, `HttpOnly`, `Secure` en producción, `SameSite=Strict` y duración de dos horas.
- Validación de origen para solicitudes que modifican información y mitigación de CSRF.
- CSP restrictiva, protección contra clickjacking, HSTS en producción y bloqueo de MIME sniffing.
- RLS en tablas de Supabase y clave secreta disponible únicamente en el servidor de Render.
- Límite de intentos para el acceso local y límites estrictos para cuerpos e imágenes.

## Operación segura

1. Activa 2FA o una passkey en Google, GitHub, Supabase y Render.
2. Conserva `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_PASSWORD` y `SESSION_SECRET` únicamente en Render/Supabase.
3. Rota de inmediato cualquier secreto que aparezca en una captura, URL, chat o repositorio.
4. Revisa periódicamente los eventos de seguridad y dispositivos activos de Google.
5. Mantén habilitado RLS y revisa el Security Advisor de Supabase.
6. Ejecuta `npm audit --omit=dev` y las pruebas antes de cada despliegue.

## Alcance de Google

La aplicación solicita solamente identidad básica (`openid`, correo y perfil). No solicita acceso a Gmail, Drive, Calendar, contactos ni Google Photos. La contraseña de Google se introduce únicamente en páginas de Google y no llega a RSF-PHONE ni a Render.
