# Sabor Casero — Pedidos por voz (demo)

Demo de interfaz de pedidos por voz con IA para un local de comida. Cliente habla o escribe lo que se le antoja, la IA sugiere o reconoce el plato del menú, el cliente confirma, y el pedido aparece en una vista de cajero.

## Estado actual

Esto es un **prototipo visual**, sin backend. Vive entero en `index.html`:

- Reconocimiento de voz: Web Speech API del navegador (funciona en Chrome/Edge; en Safari/iOS puede fallar — por eso hay campo de texto como respaldo).
- "IA": coincidencia simple de palabras clave contra un menú fijo en el código — no usa un modelo real todavía.
- Envío a caja: simulado en memoria del navegador. Si abres la vista Cajero en otra pestaña o dispositivo, no ve nada — no hay servidor de por medio.
- Menú: datos de ejemplo (seco de pollo, encebollado, ceviche, bolón, etc.) — hay que reemplazarlos por el menú real.
- Imágenes de platos: iconos SVG generados, no fotos — una página publicada no puede cargar imágenes externas.

## Cómo probarlo

Abre `index.html` directamente en el navegador. No necesita servidor ni instalación.

## Siguiente paso para que sea real

1. **Entendimiento del pedido por IA real**: endpoint en NestJS que reciba la transcripción y llame a la API de Claude con el menú como contexto, devolviendo el match estructurado.
2. **Sincronización cliente ↔ cajero**: al confirmar, guardar el pedido en Postgres (Prisma) y emitir el evento por Socket.IO para que la pantalla de caja lo reciba en vivo.

## Stack previsto

NestJS · PostgreSQL · Prisma · Socket.IO · Next.js/React (frontend) · Claude API
