# Prompt de implementación — Milo: voz fluida, pasarela y caja en vivo

## Objetivo
Evolucionar HianStudios/pedidos-voz-demo conservando su identidad cálida y la pantalla centrada en Milo. Implementar este encargo sobre el código actual y comprobar los recorridos de pedido; no limitarse a proponer un diseño.

## 1. Conversación y voz
Aumentar moderadamente la velocidad de síntesis (valor inicial 1.15, ajustable), elegir una voz española de buena calidad disponible y evitar locuciones superpuestas o cortadas por mensajes automáticos. Mantener una sola respuesta por turno y reanudar la escucha al terminar. No prometer una voz neuronal donde solo exista síntesis del dispositivo. El inicio debe ser por toque y permiso; eliminar textos y dependencias de «di Milo» o «di su nombre». Durante una sesión se conversa sin palabra de activación. Permitir detener el micrófono e interrumpir la locución.

## 2. Corregir Solo
La selección «Solo» y «quiero ver platos solos» deben abrir Platos directamente. «Medio pollo», «un medio» y «dame medio pollo» deben reconocerse como una unidad de la presentación correspondiente. Distinguir consultas, cantidades y negaciones; no depender de que el usuario reproduzca una frase fija. El fragmento reportado «me apoyo» es ambiguo y puede proceder de una mala transcripción: si aparece en Platos, preguntar si quiso decir medio pollo; no convertirlo silenciosamente en una compra. Conservar contexto de categoría y referencias visuales. Los comandos básicos deben funcionar sin proveedor de IA; la conversación libre debe conservar su integración con IA.

## 3. Pasarela circular
Reemplazar la cuadrícula/lista de comida por un carrusel horizontal continuo y cíclico. Las tarjetas deben permitir leer nombre, descripción y precio. Usar velocidad suave inicial cercana a 24 px/s. El cliente puede decir el nombre de lo que prefiere sin pulsar la tarjeta. Mantener una alternativa accesible de selección manual claramente rotulada. Pausar al interactuar, al hablar/procesar una selección y con movimiento reducido; ofrecer pausa y navegación anterior/siguiente. No seleccionar automáticamente un producto al pasar por el centro. No crear duplicados accesibles en los clones usados para el ciclo.

## 4. Interfaz
Mantener fondo, pelota animada y título como protagonistas. Refinar composición, tipografía, luz ambiental, contraste y modales. No reinstalar un menú lateral permanente. Mostrar categorías y productos bajo demanda. Mantener controles discretos de voz, texto y revisión. Diseño adaptable a móvil y escritorio, sin desbordamientos.

## 5. Caja independiente
Crear /caja.html como pantalla exclusiva para personal: pedidos, cantidades, notas, nombre, total, hora y estados. Retirar la caja modal del cliente y usar un enlace a la página independiente. Proteger los datos reales con la autenticación de personal existente; no exponer secretos en HTML, URL o almacenamiento persistente del navegador.

Actualizar pedidos automáticamente sin recargar. Usar un canal SSE autenticado con reconexión y recuperación mediante snapshots para modo compartido, conservando Redis existente. El servidor comprobará cambios cada 1.5 segundos y enviará snapshots al cambiar: esto es actualización en vivo con latencia, no una garantía instantánea. Limitar conexiones para la duración serverless y recuperar tras cortes. En demo usar eventos locales entre pestañas del mismo origen, identificando expresamente que no sincroniza distintos dispositivos. Mostrar estado de conexión y reconectar al volver a la pestaña. Mantener idempotencia en envíos y transiciones válidas de estados.

## 6. Integridad del pedido
No enviar por un «sí» ajeno a una revisión activa. No capturar correcciones como nombres. No hacer ofertas de bebida que interrumpan cada edición. Solo confirmar registro tras resultado real y distinguir pedido de prueba. El resumen debe incluir modificaciones. Un error de red conserva el mismo identificador de envío para reintentar.

## Validación
Probar Solo → medio pollo → resumen → nombre → confirmación → caja; consultas sin agregar; negaciones; ambigüedad de transcripción; cantidades múltiples; carrusel móvil/escritorio, ciclo y pausa; velocidad y cancelación de voz con dobles de navegador; caja independiente, estados, actualización entre pestañas; SSE autorizado/no autorizado, snapshots y recuperación. Reportar por separado comprobaciones locales y audio/servicios reales pendientes.

## Entrega
Código y este prompt en una rama revisable, con PR y explicación breve. No afirmar que la web pública está actualizada sin desplegar ni que la voz se escuchó en un dispositivo real si solo se validó su controlador.
