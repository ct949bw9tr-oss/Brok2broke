# Broke2Broke

Marketplace estudiante-a-estudiante para **Hult International Business School** (Launch V1).

> Pregunta del experimento MVP: *"¿Prefieren los estudiantes un marketplace donde comprar/vender solo con otros estudiantes verificados y cercanos?"*
> Hult es el mercado de prueba: la app recoge datos reales de anuncios y transacciones para decidir qué construir después.

![Landing](docs/screenshots/01-landing.png)

## Qué incluye

| Funcionalidad | Detalle |
| --- | --- |
| **Email y contraseña** | Registro y acceso con email + contraseña (mínimo 8 caracteres), sin códigos. Abierto a cualquier email, o limitado a dominios universitarios (ver abajo); la restricción la aplica la base de datos (trigger en `auth.users`). |
| **Campus** | Boston, London, Dubai, San Francisco. Cada uno con su moneda (USD/GBP/AED) y su zona horaria. |
| **Anuncios** | Venta, intercambio (swap) o gratis. Hasta 6 fotos (se redimensionan en el móvil antes de subir), categoría, estado, descripción. Se pueden reservar, editar, retirar y marcar como vendidos. |
| **Buscar y filtrar** | Texto, categoría, gratis/swap, "en el Sunday Market", campus, orden por precio. |
| **Mensajes** | Chat comprador-vendedor por anuncio, con respuestas rápidas, contador de no leídos y refresco automático. Los emails nunca se muestran a otros estudiantes. |
| **Sunday Market** | Mercado presencial semanal por campus: los vendedores marcan qué traen, los estudiantes confirman asistencia (comprador/vendedor) y el equipo publica lugar y horario. |
| **Ventas registradas** | Al marcar como vendido se guarda precio final, comprador (si habló contigo por la app) y canal (*meetup* o *Sunday Market*). |
| **Insights (solo equipo)** | Panel del experimento: estudiantes, vendedores, compradores, anuncios, transacciones, % vendido, conversación→venta, mediana de tiempo hasta venta, compradores recurrentes, GMV por moneda, categorías y evolución semanal. Filtrable por campus. |

Capturas en [`docs/screenshots/`](docs/screenshots).

## Stack

- **Next.js 16** (App Router, Server Actions) + React 19 + TypeScript
- **Supabase**: Auth (OTP por email), Postgres con Row Level Security, Storage para fotos
- CSS propio (sin framework), modo claro/oscuro, diseño mobile-first con barra inferior en móvil

Toda la seguridad vive en la base de datos (RLS + funciones `security definer`): un estudiante no puede editar anuncios ajenos, leer chats ajenos, marcarse como admin, marcar "vendido" sin registrar la transacción ni subir fotos a la carpeta de otro.

## Puesta en marcha

### 1. Crear el proyecto de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → ejecuta en orden los archivos de `supabase/migrations/`.
3. **Authentication → Sign In / Providers → Email**: activado, y **Confirm email desactivado** (así se entra nada más crear la cuenta, sin emails).
4. (Opcional) Si más adelante activas *Confirm email*, pega `supabase/templates/magic_link.html` en **Confirm signup**; el enlace de confirmación vuelve a `/auth/confirm`.
5. **Authentication → URL Configuration**: *Site URL* = la URL de tu web (p. ej. `https://broke2broke.vercel.app`) y añade `https://…/auth/confirm` a *Redirect URLs*.
6. Solo si activas *Confirm email*: configura un SMTP propio (Authentication → SMTP). El de Supabase solo envía unos pocos emails por hora.

### 2. Ejecutar en local

```bash
cp .env.example .env.local   # pon la URL y la publishable key del proyecto
npm install
npm run dev                  # http://localhost:3000
```

### 3. Hacer admin a alguien del equipo

Después de que se registre con su email de Hult:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'tu.nombre@student.hult.edu');
```

Los admins ven **Insights** en el menú y pueden fijar lugar/horario del Sunday Market.

### 4. Desplegar

Vercel (o similar): importa el repo y añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No hace falta ninguna clave secreta.

## Pagos con tarjeta (Stripe Connect, 10% de comisión)

1. Crea una cuenta en [stripe.com](https://stripe.com) y activa **Connect** (Dashboard → Connect → Get started, tipo *Marketplace*).
2. En Vercel añade `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY` y `STRIPE_PLATFORM_COUNTRY` (ver `.env.example`).
3. Stripe → Developers → **Webhooks** → *Add endpoint*: `https://TU-WEB/api/stripe/webhook`, eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`. Copia el *Signing secret* a `STRIPE_WEBHOOK_SECRET` y haz Redeploy.
4. Cada vendedor pulsa **Get paid** (en *Me*) una vez para conectar su banco. Desde ese momento sus anuncios muestran **Buy now**.

Flujo: el comprador paga en Stripe Checkout → el webhook marca el anuncio como vendido, registra la venta (`in_app`) y abre un chat para quedar → Stripe transfiere el 90% al vendedor y el 10% queda en tu cuenta. Si dos personas pagan el mismo artículo, al segundo se le devuelve el dinero automáticamente.



Por defecto el registro está **abierto a cualquier email** (la tabla `allowed_email_domains` está vacía).
Para limitarlo a emails universitarios, añade los dominios (la web lo aplica al momento, sin redeploy):

```sql
insert into public.allowed_email_domains (domain, university) values
  ('student.hult.edu', 'Hult International Business School'),
  ('hult.edu', 'Hult International Business School');
```

Para volver a abrirlo: `delete from public.allowed_email_domains;`

## Tests

```bash
npm run lint && npm run typecheck && npm test   # unit tests
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db   # RLS y reglas de negocio
```

`test:db` monta una base de datos temporal y comprueba registro solo con dominios permitidos, visibilidad de anuncios, privacidad de chats, ventas y métricas, RSVPs y permisos de Storage. GitHub Actions ejecuta todo en cada push.

## Estructura

```
src/app/               páginas (landing, login, browse, listings, messages, market, me, insights)
src/server/actions/    Server Actions (escrituras, validadas con zod)
src/server/queries.ts  lecturas (como el usuario conectado → RLS)
src/lib/catalog.ts     campus, categorías, precios, fechas del mercado
supabase/migrations/   esquema, RLS, funciones y métricas
supabase/tests/        tests SQL
```
