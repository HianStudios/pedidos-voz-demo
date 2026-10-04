// Funcion serverless de Vercel: recibe audio grabado del navegador,
// lo manda a Groq Whisper para transcribir, devuelve el texto.
// Soporta multipart/form-data con el campo 'file'.

import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: false, // necesitamos el body crudo para el multipart
  },
};

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' });
    return;
  }

  try {
    const rawBody = await parseMultipart(req);
    const contentType = req.headers['content-type'] || '';

    // Extraer el boundary del multipart
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      res.status(400).json({ error: 'Falta boundary en content-type' });
      return;
    }

    const boundary = boundaryMatch[1];
    const parts = splitMultipart(rawBody, boundary);
    const filePart = parts.find(p => p.name === 'file');

    if (!filePart) {
      res.status(400).json({ error: 'Falta campo file en el form' });
      return;
    }

    // Reenviar a Groq Whisper como multipart
    const groqForm = new FormData();
    groqForm.append('file', new Blob([filePart.data], { type: filePart.type || 'audio/webm' }), filePart.filename || 'audio.webm');
    groqForm.append('model', 'whisper-large-v3');
    groqForm.append('language', 'es');
    groqForm.append('response_format', 'json');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqForm,
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq Whisper error:', errText);
      res.status(502).json({ error: 'Error en Whisper', detail: errText });
      return;
    }

    const data = await groqRes.json();
    res.status(200).json({ text: data.text || '' });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}

// Parser multipart minimo — extrae partes con name, filename, type, data
function splitMultipart(buffer, boundary) {
  const sep = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = buffer.indexOf(sep, start);
    if (idx === -1) break;

    if (start > 0) {
      const partBuf = buffer.slice(start, idx);
      const part = parsePart(partBuf);
      if (part) parts.push(part);
    }

    start = idx + sep.length;
    // Skip \r\n after boundary
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
    // Check for -- (end marker)
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break;
  }

  return parts;
}

function parsePart(buf) {
  // Find the blank line separating headers from body
  const headerEnd = buf.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const headerStr = buf.slice(0, headerEnd).toString('utf8');
  const data = buf.slice(headerEnd + 4, buf.length - 2); // trim trailing \r\n

  const nameMatch = headerStr.match(/name="([^"]+)"/);
  const filenameMatch = headerStr.match(/filename="([^"]+)"/);
  const typeMatch = headerStr.match(/Content-Type:\s*(.+)/i);

  return {
    name: nameMatch ? nameMatch[1] : '',
    filename: filenameMatch ? filenameMatch[1] : '',
    type: typeMatch ? typeMatch[1].trim() : '',
    data,
  };
}
