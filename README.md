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

- **Pantalla de mesa = solo Milo.** Sin titulares, sin marca, sin enlace a caja. Abajo, un dock discreto: menú, teclado, micrófono y pedido.
- **Mesa por dispositivo.** Abrir una vez `/?mesa=7` en la tablet de la mesa 7; queda guardado en ese navegador (`/?mesa=` lo quita). Con mesa, Milo no pide nombre y el pedido llega a caja como «Mesa 7». Sin mesa se mantiene el flujo de retiro con nombre. La mesa no está verificada: quien tenga el dispositivo puede cambiar la URL.
- **Menú animado y minimalista** en hoja de pantalla completa: cuatro «puertas» (Platos, Combos, Extras, Bebidas), pestañas con subrayado animado y una repisa horizontal de tarjetas que entran escalonadas y flotan. **Mientras Milo nombra un producto, su tarjeta se ilumina y se centra.** «Agregar» suma al instante sin cerrar el menú.
- Tocar a Milo inicia la sesión de voz. Tras cada respuesta suena un tono corto y vuelve a escuchar. Si el navegador cierra el micrófono sin captar una frase, lo reabre solo durante 40 s; si el reconocimiento de Chrome falla, pasa solo a grabar y transcribir. Tocarlo mientras habla lo interrumpe.
- Tras 2 minutos sin uso, la pantalla vuelve a Milo y apaga el micrófono (el pedido en curso se conserva).
- La confirmación verbal solo envía si corresponde a un resumen vigente. Cualquier edición invalida la revisión anterior.

## Voz y límites

- Milo habla **frase por frase** y pronuncia precios y medidas como un mesero («cuatro dólares con cincuenta», «cuatrocientos mililitros»), sin emojis ni símbolos (`public/js/speech-text.js`).
- Las respuestas locales dicen lo anotado («Van dos cuartos de pollo y una Coca-Cola. ¿Algo para tomar?») y ofrecen bebida una sola vez por pedido, nunca si ya hay bebida o combo.
- **Voz neural opcional.** Con `AZURE_SPEECH_KEY` y `AZURE_SPEECH_REGION`, el servidor usa Azure (voz `es-EC-AndreaNeural` por defecto, acento de Ecuador). Si no, usa ElevenLabs cuando estén `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID`. Si no hay ninguno, se usa la voz del navegador: velocidad 1.05, una sola voz por sesión, con preferencia por las voces «Natural» de es-EC. **Gratis y con buena calidad:** Microsoft Edge en Windows trae las voces «Natural» de Azure. Dos fallas seguidas de la voz neural vuelven a la del navegador, para no alternar voces.
- **Pronunciación:** `pronunciations` en `public/js/speech-text.js` convierte marcas y siglas (Sprite → «Spráit», BBQ → «bibikiú»). Agrega ahí las de cada restaurante.
- Al mostrar una categoría, Milo nombra **todos** los productos y cada tarjeta se ilumina cuando la menciona.
- Después de cada cambio, Milo pregunta si quieres algo más o cerrar el pedido. «Finalizar», «confírmalo», «ya, envíalo» o «cerramos» muestran el resumen, y un «sí» sobre ese resumen lo envía.
- Se requiere permiso de micrófono y HTTPS (o localhost). Si no hay SpeechRecognition se graba y transcribe con Groq Whisper; el corte por silencio (900 ms) debe calibrarse con el ruido real del local. No hay interrupción por voz mientras Milo habla; se interrumpe tocándolo.

## IA

Configurar `GROQ_API_KEY` en el servidor. **La personalidad sale de la PARTE I de `prompts/Milo_Prompt_Maestro_Mesero_Voz.md`** (única fuente; `api/match.js` la lee al arrancar y le añade el contrato JSON y el contexto del turno). Con modelos `gpt-oss` se usa `reasoning_effort: low` para responder más rápido. `GROQ_MODEL` permite cambiar el modelo conversacional, por defecto `openai/gpt-oss-120b`. La transcripción usa `whisper-large-v3`.

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

**Alcance:** un restaurante por despliegue, mesa (por URL) o retiro. No hay mesas verificadas, pagos, inventario con reserva, impresora, panel de edición de catálogo ni cuentas individuales de personal. Para operar varios restaurantes, usar despliegues y credenciales separados o implementar multitenencia autenticada antes de compartir una base. Cambiar el catálogo es un cambio de código.

El modo conectado significa configuración presente, no que las credenciales hayan sido validadas al iniciar: los fallos del servicio se muestran al operar. No se incluye aprovisionamiento automático de Upstash ni acceso a las variables de Vercel desde este repositorio.

## Personalización

`server/catalog.js` define restaurante, saludo, productos, opciones, disponibilidad y precios en centavos. El catálogo es de ejemplo, incluida su disponibilidad; sustituirlo por datos aprobados antes del uso comercial. `public/styles.css` contiene los colores. La mascota es genérica; la pollería es la primera configuración. Las ilustraciones SVG de `public/js/art.js` son ilustraciones, no fotografías de productos reales.

El campo `id` del restaurante separa claves de almacenamiento en Redis; no se acepta desde la petición del cliente. En la versión actual los nombres/textos de marca secundarios se editan también en `index.html`. No se promete una plataforma multitenant administrable desde interfaz.

## Estructura

- `index.html`, `public/milo.css`, `public/js/app.js`: pantalla de mesa (Milo, menú animado, resumen).
- `caja.html`, `public/js/cashier.js`, `public/styles.css`: página independiente del personal.
- `public/js/voice.js`: micrófono, reconocimiento, grabación, locución frase por frase y voz neural opcional.
- `public/js/speech-text.js`: números, dinero y medidas en palabras.
- `public/js/domain.js`, `public/js/conversation.js`: carrito, intérprete local y navegación.
- `api/match.js` (IA), `api/speak.js` (voz neural), `api/transcribe.js`, `api/orders.js`, `api/order-events.js`, `api/menu.js`.
- `prompts/Milo_Prompt_Maestro_Mesero_Voz.md`: personalidad de Milo (en uso).

Prueba de navegador: con `npm run dev` en marcha, `CODEX_PRIMARY_RUNTIME_NODE_MODULES=<ruta a node_modules con playwright> node tests/browser.cjs`.
