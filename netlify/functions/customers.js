const { getStore } = require('@netlify/blobs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const store = getStore({ name: 'bark-bliss-customers', consistency: 'strong' });

  try {
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (id) {
        const data = await store.get(id, { type: 'json' });
        if (!data) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }
      const index = (await store.get('__index', { type: 'json' })) || [];
      return { statusCode: 200, headers, body: JSON.stringify(index) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);
      const id = 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const customer = { id, ...data, createdAt: new Date().toISOString() };
      await store.setJSON(id, customer);
      const index = (await store.get('__index', { type: 'json' })) || [];
      index.push(indexEntry(customer));
      await store.setJSON('__index', index);
      return { statusCode: 201, headers, body: JSON.stringify(customer) };
    }

    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body);
      if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID required' }) };
      await store.setJSON(data.id, data);
      const index = (await store.get('__index', { type: 'json' })) || [];
      const i = index.findIndex(c => c.id === data.id);
      const entry = indexEntry(data);
      if (i >= 0) index[i] = entry; else index.push(entry);
      await store.setJSON('__index', index);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID required' }) };
      await store.delete(id);
      const index = (await store.get('__index', { type: 'json' })) || [];
      await store.setJSON('__index', index.filter(c => c.id !== id));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('customers fn error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function indexEntry(c) {
  return {
    id: c.id,
    ownerName: c.ownerName,
    phone: c.phone,
    lastVisit: c.lastVisit || null,
    dogs: (c.dogs || []).map(d => ({ id: d.id, name: d.name, breed: d.breed }))
  };
}
