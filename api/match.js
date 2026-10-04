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

  const systemPrompt = `Eres un mesero virtual amable de un restaurante ecuatoriano. Este es el menu COMPLETO:
${menuList}

El cliente habla en espanol ecuatoriano, de forma natural. Tu trabajo:
1. Identificar que platos pide y EN QUE CANTIDAD.
2. Si pide recomendacion o pregunta que hay, recomienda 2-3 platos del menu.

FORMATO DE RESPUESTA (JSON valido, sin texto adicional):

Cuando el cliente PIDE algo concreto:
{"items": [{"id": 2, "qty": 3}, {"id": 7, "qty": 1}], "reply": "¡3 encebollados y una Coca-Cola, excelente!"}

Cuando pide RECOMENDACION o pregunta que hay:
{"items": [], "suggest_ids": [2, 3, 4], "reply": "Le recomiendo el encebollado, el ceviche de camaron y el bolon. ¡Todos estan buenisimos!"}

Cuando NO coincide con nada del menu:
{"items": [], "suggest_ids": [2, 3, 7], "reply": "Eso no lo tenemos, pero le recomiendo estas opciones."}

REGLAS CRITICAS:
- SIEMPRE detecta la CANTIDAD. "dame tres encebollados" = qty:3, "quiero dos coca colas" = qty:2, "un ceviche" = qty:1, si no dice cantidad asume qty:1.
- "reply" debe ser corto, natural, amable, como un mesero real. Menciona lo que pidio con las cantidades.
- Solo usa ids que existen en el menu de arriba.
- Nunca inventes platos que no estan en el menu.`;

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
