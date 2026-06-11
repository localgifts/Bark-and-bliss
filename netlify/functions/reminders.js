const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log('No Twilio config - skipping reminders');
    return { statusCode: 200, body: 'No SMS configured' };
  }

  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const from = process.env.TWILIO_FROM_NUMBER;

  const store = getStore({ name: 'bark-bliss-appointments', consistency: 'strong' });
  const index = (await store.get('__index', { type: 'json' })) || [];

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  let sent = 0;
  const updated = [];

  for (const appt of index) {
    if (appt.status !== 'scheduled' || !appt.phone) { updated.push(appt); continue; }
    const t = fmtTime(appt.time || '10:00');
    const firstName = (appt.ownerName || '').split(' ')[0] || 'there';
    let changed = false;

    if (appt.date === todayStr && !appt.todayReminderSent) {
      const msg = `Morning ${firstName}! Just a reminder that ${appt.dogName}'s appointment is today at ${t}. See you soon! - Bark & Bliss 🐾`;
      try { await client.messages.create({ body: msg, from, to: appt.phone }); appt.todayReminderSent = true; changed = true; sent++; }
      catch (e) { console.error('SMS failed:', e.message); }
    }

    if (appt.date === tomorrowStr && !appt.tomorrowReminderSent) {
      const d = new Date(appt.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const msg = `Hi ${firstName}! Just a reminder that ${appt.dogName}'s appointment is tomorrow (${d}) at ${t}. - Bark & Bliss 🐾`;
      try { await client.messages.create({ body: msg, from, to: appt.phone }); appt.tomorrowReminderSent = true; changed = true; sent++; }
      catch (e) { console.error('SMS failed:', e.message); }
    }

    if (changed) await store.setJSON(appt.id, appt);
    updated.push(appt);
  }

  await store.setJSON('__index', updated);
  console.log(`Reminders sent: ${sent}`);
  return { statusCode: 200, body: `Sent ${sent} reminders` };
};

function fmtTime(t) {
  const [h, m] = t.split(':'); const hour = parseInt(h);
  return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`;
}
