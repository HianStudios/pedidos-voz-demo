// Funcion serverless de Vercel: recibe lo que dijo/escribio el cliente + el menu,
// llama a Groq (modelo openai/gpt-oss-120b) para identificar que plato(s) pidio,
// y devuelve un JSON estructurado. La API key nunca llega al navegador.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' });
    return;
  }

  const { transcript, menu } = req.body || {};
  if (!transcript || !Array.isArray(menu) || menu.length === 0) {
    res.status(400).json({ error: 'Falta transcript o menu' });
    return;
  }

  const menuList = menu.map(d => `${d.id}: ${d.name} - ${d.desc}`).join('\n');

  const systemPrompt = `Eres el asistente de pedidos de un restaurante. Este es el menu disponible:
${menuList}

El cliente va a decir lo que se le antoja, en espanol, de forma natural, directa o indirecta.
Identifica cuales platos del menu (por id) coinciden con lo que pidio.

Reglas:
- Si el cliente no sabe que pedir, pide una recomendacion, o dice algo como "sorprendeme", responde con "suggest": true y "matched_ids" vacio.
- Si identificas uno o mas platos, pon sus ids en "matched_ids" (maximo 3), y "suggest": false.
- Si no hay ningun plato que coincida y no esta pidiendo recomendacion, "matched_ids" vacio y "suggest": true (para ofrecerle opciones).
- "reply" es una frase corta, natural y amable en espanol, como la diria un mesero.
- Responde SIEMPRE en JSON valido, sin texto adicional, exactamente con este formato:
{"matched_ids": [1,2], "suggest": false, "reply": "..."}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      res.status(502).json({ error: 'Error llamando a Groq', detail: errText });
      return;
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { matched_ids: [], suggest: true, reply: 'No entendi bien, le muestro algunas opciones.' };
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}
