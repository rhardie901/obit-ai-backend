const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ── POST /api/payment/create-checkout-session ───────────────────
// body: { fullName }  — used only for the line item label, never stored beyond this
router.post('/create-checkout-session', async (req, res) => {
  const { fullName } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Obit AI — Memorial Document Export',
              description: fullName ? `Word & PDF export for ${fullName}` : 'Word & PDF export'
            },
            unit_amount: parseInt(process.env.EXPORT_PRICE_CENTS || '1900', 10)
          },
          quantity: 1
        }
      ],
      success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}&paid=true`,
      cancel_url: `${req.headers.origin}/?paid=false`
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe session error:', err.message);
    res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// ── GET /api/payment/verify/:sessionId ───────────────────────────
// Frontend calls this after redirect to confirm payment before allowing export
router.get('/verify/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({ paid: session.payment_status === 'paid' });
  } catch (err) {
    console.error('Stripe verify error:', err.message);
    res.status(404).json({ error: 'Session not found' });
  }
});

// ── POST /api/payment/webhook ─────────────────────────────────────
// Stripe webhook — must use raw body, configured in server.js before express.json()
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Payment completed:', session.id, session.amount_total);
    // No customer data is persisted here — this log line is transaction
    // metadata only (session id, amount). Extend here if you later add
    // order tracking, but keep memorial content itself out of any store.
  }

  res.json({ received: true });
});

module.exports = router;
