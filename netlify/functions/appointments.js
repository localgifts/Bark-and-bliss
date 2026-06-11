const { getStore } = require('@netlify/blobs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const store = getStore({ name: 'bark-bliss-appointments', consistency: 'strong' });

  try {
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (id) {
        const data = await store.get(id, { type: 'json' });
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }
      const index = (await store.get('__index', { type: 'json' })) || [];
      return { statusCode: 200, headers, body: JSON.stringify(index) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);
      const id = 'appt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const appt = { id, ...data, createdAt: new Date().toISOString() };
      await store.setJSON(id, appt);
      const index = (await store.get('__index', { type: 'json' })) || [];
      index.push(appt);
      await store.setJSON('__index', index);

      if (data.sendSms && data.phone && process.env.TWILIO_ACCOUNT_SID) {
        try { await sendSms(data.phone, bookingMsg(appt)); }
        catch (e) { console.error('SMS send failed:', e.message); }
      }

      return { statusCode: 201, headers, body: JSON.stringify(appt) };
    }

    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body);
      await store.setJSON(data.id, data);
      const index = (await store.get('__index', { type: 'json' })) || [];
      const i = index.findIndex(a => a.id === data.id);
      if (i >= 0) index[i] = data; else index.push(data);
      await store.setJSON('__index', index);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      await store.delete(id);
      const index = (await store.get('__index', { type: 'json' })) || [];
      await store.setJSON('__index', index.filter(a => a.id !== id));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('appointments fn error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

async function sendSms(to, body) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to });
}

function fmtTime(t) {
  const [h, m] = t.split(':'); const hour = parseInt(h);
  return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`;
}

function bookingMsg(appt) {
  const d = new Date(appt.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = (appt.ownerName || '').split(' ')[0];
  return `Hi ${firstName}! ${appt.dogName}'s ${(appt.service||'appointment').toLowerCase()} is confirmed for ${d} at ${fmtTime(appt.time)}. See you then! - Bark & Bliss 🐾`;
}
