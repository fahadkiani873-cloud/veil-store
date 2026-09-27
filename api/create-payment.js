// api/create-payment.js
// Vercel serverless function — runs on the server, never in the browser.
// This is the ONLY place your Ziina secret key should ever live.
//
// Set this in your Vercel project settings, NOT in this file:
//   Settings -> Environment Variables -> ZIINA_API_KEY = <your Ziina access token>
 
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    const { amountFils, successUrl, cancelUrl, test } = req.body;
 
    if (!amountFils || amountFils < 200) {
      // Ziina's minimum charge is 2 AED = 200 fils
      return res.status(400).json({ error: 'Invalid amount' });
    }
 
    const ziinaRes = await fetch('https://api-v2.ziina.com/api/payment_intent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ZIINA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountFils,           // amount in fils (100 AED = 10000)
        currency_code: 'AED',
        success_url: successUrl,
        cancel_url: cancelUrl,
        test: !!test,                 // true while you're testing, remove/false to go live
      }),
    });
 
    const data = await ziinaRes.json();
 
    if (!ziinaRes.ok) {
      console.error('Ziina error:', data);
      return res.status(502).json({ error: data.message || 'Payment provider error' });
    }
 
    // Send only what the browser needs back — never the API key.
    return res.status(200).json({
      id: data.id,
      redirect_url: data.redirect_url,
    });
  } catch (err) {
    console.error('create-payment error:', err);
    return res.status(500).json({ error: 'Something went wrong creating the payment.' });
  }
};
 
