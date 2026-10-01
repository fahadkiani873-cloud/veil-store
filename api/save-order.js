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
${order.pinnedLocation ? `Pinned map location: https://www.google.com/maps?q=${order.pinnedLocation}\n` : ''}Shipping protection: ${order.shippingProtection ? 'Yes' : 'No'}

Items:
${itemsList}

Total: Dhs. ${Number(order.total).toFixed(2)}
    `.trim();

    const tasks = [];

    // 1) Order notification email to YOU (the store owner)
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
        }).then(async r => {
          const d = await r.json();
          if (!r.ok) console.error('Resend owner-email error:', JSON.stringify(d));
          return { step: 'owner_email', ok: r.ok, d };
        }).catch(err => ({ step: 'owner_email', ok: false, err: String(err) }))
      );
    } else {
      console.error('save-order: missing RESEND_API_KEY or STORE_OWNER_EMAIL env var');
    }

    // 2) Receipt email to the CUSTOMER
    // Note: until you verify your own domain with Resend, their sandbox sender
    // (onboarding@resend.dev) can only deliver to the email you signed up to
    // Resend with. Real customer addresses will start receiving this
    // automatically once you verify a domain in the Resend dashboard.
    if (process.env.RESEND_API_KEY && order.email) {
      const customerText = `
Hi ${order.firstName},

Thanks for your order! Here's your receipt.

Order: ${order.orderId}

Items:
${itemsList}

Shipping to: ${order.address}, ${order.city}, ${order.country}
Total paid: Dhs. ${Number(order.total).toFixed(2)}

We'll email you again once your order ships.

— VEIL
      `.trim();

      tasks.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VEIL <onboarding@resend.dev>',
            to: order.email,
            subject: `Your VEIL order ${order.orderId} is confirmed`,
            text: customerText,
          }),
        }).then(async r => {
          const d = await r.json();
          if (!r.ok) console.error('Resend customer-email error:', JSON.stringify(d));
          return { step: 'customer_email', ok: r.ok, d };
        }).catch(err => ({ step: 'customer_email', ok: false, err: String(err) }))
      );
    }

    // 3) Google Sheet logging via Apps Script webhook
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
            pinnedLocation: order.pinnedLocation || '',
            items: itemsList,
            shippingProtection: order.shippingProtection ? 'Yes' : 'No',
            total: order.total,
          }),
        }).then(async r => {
          const d = await r.text();
          if (!r.ok) console.error('Sheet webhook error:', d);
          return { step: 'sheet', ok: r.ok, d };
        }).catch(err => ({ step: 'sheet', ok: false, err: String(err) }))
      );
    } else {
      console.error('save-order: missing SHEET_WEBHOOK_URL env var');
    }

    const results = await Promise.all(tasks);
    console.log('save-order results:', JSON.stringify(results));
    return res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('save-order error:', err);
    return res.status(500).json({ error: 'Something went wrong saving the order.' });
  }
};
