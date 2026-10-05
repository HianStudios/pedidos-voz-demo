# Brasa · Milo, mesero virtual

Interfaz de pedidos para restaurantes con mascota esférica reactiva, conversación en español y un catálogo de pollería de ejemplo. Evoluciona el prototipo original de `pedidos-voz-demo`, conservando Groq y Vercel.

## Arranque local

Requiere Node.js 22 o superior. No hay dependencias de producción.

```sh
cp .env.example .env
# Editar .env con las credenciales que se vayan a usar.
npm run dev
```

Abrir http://localhost:3000. **No abrir index.html directamente:** las rutas `/api` necesitan servidor. `npm test` ejecuta las pruebas de dominio, API y controlador de voz. `npm run build` crea el frontend publicable en `dist/` sin incluir secretos o código del servidor.

## Qué se puede hacer

- Activar el micrófono, decir «mesero» y recibir «Dígame, señor. ¿Qué desea pedir?» cuando SpeechRecognition esté disponible.
- Decir «mesero, muéstrame el menú» en una sola frase, o tocar la mascota para hablar.
- Pedir «dos cuartos de pollo y una cola», «quita una cola», «mejor tres cuartos de pollo», «sin cebolla», «eso es todo» y «me llamo Hian».
- Editar cantidades/opciones con botones, escribir mensajes y confirmar después de revisar el resumen.
- Consultar productos y precios; abrir categorías, recomendaciones y el carrito.
- Ver pedidos en caja y pasar por nuevo → aceptado → preparando → listo → entregado. Cancelación disponible antes de listo.

La confirmación es exacta y contextual. «Sin cebolla», «no confirmes» y «sí, agrega papas» nunca envían automáticamente. Cualquier edición invalida el resumen aprobado. Para retirar se solicita nombre, que también puede darse por voz con «me llamo…».

## Voz y limitaciones reales

El usuario debe activar voz y conceder permiso. Se requiere HTTPS en despliegue; localhost sirve para desarrollo. No hay escucha con la página cerrada: al ocultarla se detiene el micrófono. SpeechRecognition no está disponible de forma uniforme y puede enviar audio al servicio del navegador. **No se promete reconocimiento local/offline.**

Si el reconocimiento nativo falla o no existe, tocar a Milo inicia MediaRecorder y `/api/transcribe` usa Groq Whisper. La detección de silencio se usa en esta grabación alternativa: 1,25 s tras voz, espera inicial de 8 s y máximo de 25 s. El reconocimiento nativo utiliza su propia segmentación y un máximo de 25 s por turno. El umbral RMS de la alternativa es orientativo y requiere calibración en el ruido real del local.

Mientras Milo habla no se aceptan órdenes de voz; puede interrumpirse tocando la mascota. No se implementa interrupción simultánea por voz (barge-in). La activación «mesero» depende del reconocimiento nativo: si no está disponible se muestra la alternativa táctil, sin subir silencio continuamente a Whisper.

Las ondas de entrada responden al volumen real del micrófono. La boca/ondas de salida siguen los eventos de la locución del navegador: no son un análisis de amplitud de speechSynthesis. Se respeta movimiento reducido. Las voces disponibles dependen del dispositivo.

## IA

Configurar `GROQ_API_KEY` en el servidor. `GROQ_MODEL` permite cambiar el modelo conversacional, por defecto `openai/gpt-oss-120b`. La transcripción usa `whisper-large-v3`.

Los comandos comunes son deterministas y no consumen IA. Para frases libres, `/api/match` usa el catálogo del servidor, el carrito y los últimos turnos. Se valida cada operación devuelta; el modelo nunca tiene una herramienta que envíe pedidos. Si no hay clave o falla el proveedor, se mantienen texto, botones y comandos básicos, con mensajes explicativos.

## Dos modos de caja

### Demo automática

Sin todas las credenciales de caja, la interfaz indica **Demo interactiva**. El borrador y los pedidos se conservan en localStorage, sobreviven a recargas y se ven entre pestañas del mismo navegador/origen. No se comparten entre dispositivos. La interfaz dice «pedido de prueba», nunca que se envió a un restaurante real. La navegación privada o la limpieza de datos puede borrar esta demo.

### Caja compartida

Configurar en Vercel (o en .env local):

- `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`: base Redis REST con permisos de lectura, escritura y EVAL.
- `STAFF_TOKEN`: secreto de personal de al menos 24 caracteres.
- `SESSION_SECRET`: otro secreto de al menos 32 caracteres para firmar sesiones de clientes.

Generar dos valores aleatorios distintos, por ejemplo ejecutando dos veces `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` en un entorno privado. No pegar secretos en commits, chats o capturas.

Con las cuatro variables configuradas, `/api/menu` anuncia modo conectado y emite una cookie de sesión HttpOnly/SameSite. La pantalla Caja solicita la clave; se mantiene solo en memoria y se elimina al cerrar el acceso o recargar.

El backend valida catálogo/cantidades, calcula centavos y crea pedidos e identificadores de reintento atómicamente con Redis Lua. Un timeout conserva el mismo envío para reintentar sin duplicarlo, bloqueando ediciones hasta resolverlo. Solo se muestra éxito tras la respuesta del servidor. Caja se actualiza por polling cada 5 segundos, recuperándose tras recarga o desconexión. Los pedidos y claves de idempotencia se retienen 30 días; la lista muestra hasta los 200 pedidos más recientes.

**Alcance:** un restaurante por despliegue, modalidad retiro. No hay mesas verificadas, pagos, inventario con reserva, impresora, panel de edición de catálogo ni cuentas individuales de personal. Para operar varios restaurantes, usar despliegues y credenciales separados o implementar multitenencia autenticada antes de compartir una base. Cambiar el catálogo es un cambio de código.

El modo conectado significa configuración presente, no que las credenciales hayan sido validadas al iniciar: los fallos del servicio se muestran al operar. No se incluye aprovisionamiento automático de Upstash ni acceso a las variables de Vercel desde este repositorio.

## Personalización

`server/catalog.js` define restaurante, saludo, productos, opciones, disponibilidad y precios en centavos. El catálogo es de ejemplo, incluida su disponibilidad; sustituirlo por datos aprobados antes del uso comercial. `public/styles.css` contiene los colores. La mascota es genérica; la pollería es la primera configuración. Las ilustraciones SVG de `public/js/art.js` son ilustraciones, no fotografías de productos reales.

El campo `id` del restaurante separa claves de almacenamiento en Redis; no se acepta desde la petición del cliente. En la versión actual los nombres/textos de marca secundarios se editan también en `index.html`. No se promete una plataforma multitenant administrable desde interfaz.

## Estructura

- `index.html`: estructura accesible de cliente, carrito y caja.
- `public/styles.css`, `public/favicon.svg`: identidad y diseño responsive.
- `public/js/app.js`: interfaz, sesión de pedido y caja.
- `public/js/voice.js`: micrófono, reconocimiento, grabación, locución y cancelación.
- `public/js/domain.js`: cantidades, carrito, operaciones, intenciones y confirmación segura.
- `public/js/art.js`: ilustraciones vectoriales.
- `server/catalog.js`, `server/http.js`: catálogo, utilidades, sesiones, límites y Redis.
- `api/menu.js`, `api/match.js`, `api/transcribe.js`, `api/orders.js`: funciones serverless.
- `scripts/dev.js`, `scripts/build.js`: servidor de desarrollo y empaquetado estático.
- `tests/`: regresiones y recorrido de navegador.

## Despliegue en Vercel

Importar el repositorio como proyecto **Other**, usar Node.js 22+ y respetar `vercel.json`: `npm run build`, salida `dist/`, funciones `api/*.js`. Añadir variables en el entorno correcto (Preview o Production) y volver a desplegar. La transcripción limita audio a 3 MB y la solicitud a 3,5 MB, por debajo del límite de carga habitual de funciones; no debe aceptarse una grabación ilimitada.

Hay límites por IP y minuto: menú 90, interpretación 30, transcripción 20, pedidos 60. Con Redis son compartidos entre instancias; sin Redis son de proceso y no equivalen a protección distribuida. Antes de un despliegue público de alto tráfico, habilitar Redis y protección adicional de borde/presupuesto del proveedor. El limitador usa `x-real-ip` del alojamiento confiable; si se aloja fuera de Vercel, configurar el proxy para reemplazar ese header.

No se registra audio ni conversaciones en base de datos. Las grabaciones se envían al proveedor de transcripción cuando se usa el modo alternativo; el servicio del navegador puede procesar el reconocimiento nativo. Los pedidos guardan nombre y contenido durante 30 días en modo conectado. Revisar retención y operación del negocio antes de producción.

## Pruebas

```sh
npm test
npm run build
# Opcional: instalar Playwright y su navegador para la prueba visual:
npm install --no-save playwright
npx playwright install chromium
# Con npm run dev activo en otra terminal:
node tests/browser.cjs
```

Las pruebas automatizadas de voz usan dobles de navegador: verifican transiciones/cancelación, no calidad acústica. El acceso real a Groq, Redis y la captura de micrófono en Android/iPhone requieren credenciales/dispositivos y no deben darse por validados solo porque pase npm test. Probar especialmente ruido de restaurante, eco del altavoz, permisos, Safari/iOS, pérdida de conexión y reintento del mismo pedido.

Documentación técnica: [Groq](https://console.groq.com/docs/api-reference), [Upstash REST](https://upstash.com/docs/redis/features/restapi), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
