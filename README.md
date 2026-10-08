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

## Experiencia actual

- La pantalla principal conserva a Milo como protagonista; menú y productos aparecen bajo demanda en modales.
- Tocar a Milo inicia una sesión de voz. No requiere decir su nombre. Al responder, vuelve a escuchar; tocarlo mientras habla interrumpe la respuesta. «Apagar micrófono» detiene la sesión.
- «Solo», «quiero ver los platos solos» y «medio pollo» con Platos abierto funcionan sin IA externa. Una transcripción ambigua como «me apoyo» en Platos pide aclaración.
- Productos en pasarela horizontal circular a 24 px/s, con pausa, anterior/siguiente, selección por nombre y alternativa «Agregar». Respeta movimiento reducido y pausa al enfocar/interactuar o al escuchar/procesar voz.
- Resumen con notas y nombre. La confirmación verbal solo envía si corresponde a una revisión vigente. Una consulta o edición invalida la revisión anterior.
- Texto disponible tanto en la pantalla principal como dentro de los modales.

## Voz y límites

La síntesis del navegador usa velocidad inicial 1.15, ajustable a pausada/natural/ágil. Prioriza voces españolas identificadas como naturales cuando el dispositivo las ofrece; no incorpora un servicio TTS neuronal externo. La calidad y la latencia dependen del navegador y sus voces. No se probó aquí la acústica en micrófonos físicos.

Se requiere permiso del usuario y HTTPS (o localhost). Al ocultar la pestaña se desactiva el micrófono. Si no funciona SpeechRecognition se ofrece MediaRecorder y transcripción por Groq; la grabación alternativa termina tras 900 ms de silencio detectado, con espera inicial de 8 s y máximo de 25 s. El umbral debe probarse en el ruido real del local. No existe escucha con la página cerrada ni interrupción simultánea por voz con control de eco; se interrumpe tocando el control.

Una respuesta se reproduce por turno. Se eliminaron los temporizadores que abrían bebidas y cortaban otra locución, y las ofertas automáticas tras cada edición.

## IA

Configurar `GROQ_API_KEY` en el servidor. `GROQ_MODEL` permite cambiar el modelo conversacional, por defecto `openai/gpt-oss-120b`. La transcripción usa `whisper-large-v3`.

Los comandos comunes son deterministas y no consumen IA. Para frases libres, `/api/match` usa el catálogo del servidor, el carrito y los últimos turnos. Se valida cada operación devuelta; el modelo nunca tiene una herramienta que envíe pedidos. Si no hay clave o falla el proveedor, se mantienen texto, botones y comandos básicos, con mensajes explicativos.

## Dos modos de caja

### Demo automática

Sin todas las credenciales de caja, la interfaz indica **Demo interactiva**. El borrador y los pedidos se conservan en localStorage, sobreviven a recargas y se ven entre pestañas del mismo navegador/origen con eventos de almacenamiento y BroadcastChannel. La página de caja se actualiza automáticamente al registrar pedidos o cambiar estados. No se comparten entre dispositivos. La interfaz dice «pedido de prueba», nunca que se envió a un restaurante real. La navegación privada o la limpieza de datos puede borrar esta demo.

### Caja compartida

Configurar en Vercel (o en .env local):

- `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`: base Redis REST con permisos de lectura, escritura y EVAL.
- `STAFF_TOKEN`: secreto de personal de al menos 24 caracteres.
- `SESSION_SECRET`: otro secreto de al menos 32 caracteres para firmar sesiones de clientes.

Generar dos valores aleatorios distintos, por ejemplo ejecutando dos veces `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` en un entorno privado. No pegar secretos en commits, chats o capturas.

Con las cuatro variables configuradas, `/api/menu` anuncia modo conectado y emite una cookie de sesión HttpOnly/SameSite. La página `/caja.html` solicita la clave; se mantiene solo en memoria y se elimina al cerrar el acceso o recargar.

El backend valida catálogo/cantidades, calcula centavos y crea pedidos e identificadores de reintento atómicamente con Redis Lua. Un timeout conserva el mismo envío para reintentar sin duplicarlo, bloqueando ediciones hasta resolverlo. Solo se muestra éxito tras la respuesta del servidor. Caja está en `/caja.html`. Recibe un canal SSE autenticado en `/api/order-events`: snapshot al conectar, actualizaciones cuando cambian pedidos y latidos. El servidor consulta Redis cada 1.5 s; por tanto, la actualización no es instantánea ni usa Redis Pub/Sub. Cada conexión dura hasta 20 s y se renueva automáticamente. Tras cortes se reconecta con espera progresiva de hasta 15 s y recupera el snapshot completo. La pestaña oculta pausa la conexión. No requiere servicios adicionales a Redis existente; cada caja activa genera aproximadamente 40 lecturas de snapshot por minuto, además de autenticación/límites y acciones de estado. Revisar el consumo del plan antes de escalar. Los pedidos y claves de idempotencia se retienen 30 días; la lista muestra hasta los 200 pedidos más recientes.

**Alcance:** un restaurante por despliegue, modalidad retiro. No hay mesas verificadas, pagos, inventario con reserva, impresora, panel de edición de catálogo ni cuentas individuales de personal. Para operar varios restaurantes, usar despliegues y credenciales separados o implementar multitenencia autenticada antes de compartir una base. Cambiar el catálogo es un cambio de código.

El modo conectado significa configuración presente, no que las credenciales hayan sido validadas al iniciar: los fallos del servicio se muestran al operar. No se incluye aprovisionamiento automático de Upstash ni acceso a las variables de Vercel desde este repositorio.

## Personalización

`server/catalog.js` define restaurante, saludo, productos, opciones, disponibilidad y precios en centavos. El catálogo es de ejemplo, incluida su disponibilidad; sustituirlo por datos aprobados antes del uso comercial. `public/styles.css` contiene los colores. La mascota es genérica; la pollería es la primera configuración. Las ilustraciones SVG de `public/js/art.js` son ilustraciones, no fotografías de productos reales.

El campo `id` del restaurante separa claves de almacenamiento en Redis; no se acepta desde la petición del cliente. En la versión actual los nombres/textos de marca secundarios se editan también en `index.html`. No se promete una plataforma multitenant administrable desde interfaz.

## Estructura

- `index.html`: cliente, pasarela y resumen.
- `caja.html`, `public/js/cashier.js`: página independiente del personal.
- `public/js/carousel.js`: movimiento, ciclo y pausa de la pasarela.
- `public/js/conversation.js`: navegación semántica básica y estado de revisión.
- `api/order-events.js`, `server/order-feed.js`, `public/js/live-feed.js`: stream autenticado, snapshots y reconexión.
- `prompts/Mejoras_Milo_Pasarela_Caja.md`: encargo profesional usado en esta iteración.
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

## Validación de esta iteración

Ejecutar `npm test`, `npm run build` y, con el servidor activo, `node tests/browser.cjs`. El recorrido automatizado comprueba Solo, medio pollo, aclaración de transcripción, resumen con notas, confirmación contextual, caja entre pestañas, cambios de estado y tamaños móvil/escritorio. Las pruebas de SSE comprueban snapshots, cambios, cierre, parsing fragmentado y rechazo sin autorización.

La sincronización entre dispositivos necesita las credenciales de Redis y personal descritas arriba. Las pruebas locales no validan credenciales de producción, servicios Groq reales ni el audio físico del usuario. La documentación de streaming utilizada es [Vercel Functions Streaming](https://vercel.com/docs/functions/streaming-functions). Verificar el canal en el despliegue antes de declarar servicio real en vivo.
