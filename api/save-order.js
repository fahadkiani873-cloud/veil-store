// api/save-order.js
// Called once a payment is confirmed. Sends you an email with the order
// details and (optionally) logs the same order as a row in a Google Sheet.
//
// Environment variables to set in Vercel (Settings -> Environment Variables):
//   RESEND_API_KEY         - from resend.com, used to send the email
//   STORE_OWNER_EMAIL      - the email address that should receive orders
//   SHEET_WEBHOOK_URL      - (optional) your Google Apps Script Web App URL

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const order = req.body;
    const itemsList = (order.cart || [])
      .map(item => {
        const variants = (item.variants || [])
          .map(v => `${v.color} / ${v.size}`)
          .join(', ');
        return `- ${item.label} (${variants}) — Dhs. ${Number(item.price).toFixed(2)}`;
      })
      .join('\n');

    const summaryText = `
New VEIL order: ${order.orderId}

Customer: ${order.firstName} ${order.lastName}
Email: ${order.email}
Address: ${order.address}, ${order.city}, ${order.country}
Shipping protection: ${order.shippingProtection ? 'Yes' : 'No'}

Items:
${itemsList}

Total: Dhs. ${Number(order.total).toFixed(2)}
    `.trim();

    const tasks = [];

    // 1) Email notification via Resend
    if (process.env.RESEND_API_KEY && process.env.STORE_OWNER_EMAIL) {
      tasks.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VEIL Orders <onboarding@resend.dev>',
            to: process.env.STORE_OWNER_EMAIL,
            subject: `New order: ${order.orderId}`,
            text: summaryText,
          }),
        }).then(r => r.json()).then(d => ({ step: 'email', ok: true, d }))
          .catch(err => ({ step: 'email', ok: false, err: String(err) }))
      );
    }

    // 2) Google Sheet logging via Apps Script webhook
    if (process.env.SHEET_WEBHOOK_URL) {
      tasks.push(
        fetch(process.env.SHEET_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.orderId,
            date: new Date().toISOString(),
            firstName: order.firstName,
            lastName: order.lastName,
            email: order.email,
            address: order.address,
            city: order.city,
            country: order.country,
            items: itemsList,
            shippingProtection: order.shippingProtection ? 'Yes' : 'No',
            total: order.total,
          }),
        }).then(r => r.text()).then(d => ({ step: 'sheet', ok: true, d }))
          .catch(err => ({ step: 'sheet', ok: false, err: String(err) }))
      );
    }

    const results = await Promise.all(tasks);
    return res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('save-order error:', err);
    return res.status(500).json({ error: 'Something went wrong saving the order.' });
  }
};
