// api/check-payment.js
// Verifies a payment actually completed before you treat an order as paid.
// Never trust the success_url redirect alone — anyone could type that URL
// in manually without paying. Always confirm status server-side like this.
 
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing payment intent id' });
  }
 
  try {
    const ziinaRes = await fetch(`https://api-v2.ziina.com/api/payment_intent/${id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.ZIINA_API_KEY}`,
      },
    });
 
    const data = await ziinaRes.json();
 
    if (!ziinaRes.ok) {
      return res.status(502).json({ error: data.message || 'Payment provider error' });
    }
 
    // status is one of:
    // requires_payment_instrument | pending | requires_user_action | completed | failed
    return res.status(200).json({ status: data.status });
  } catch (err) {
    console.error('check-payment error:', err);
    return res.status(500).json({ error: 'Something went wrong checking the payment.' });
  }
};
 
