import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const config = {
  api: { bodyParser: false }
};

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }
  return getFirestore();
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await readRawBody(req);

  // Verify Shopify HMAC
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');

  if (hash !== hmac) return res.status(401).json({ error: 'Unauthorized' });

  let order;
  try {
    order = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const email = (order.email || '').toLowerCase().trim();
  if (!email) return res.status(200).json({ ok: true, skipped: 'no email' });

  try {
    const db = getDb();

    // Find Firebase user by email
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return res.status(200).json({ ok: true, skipped: 'no matching user' });

    const uid = snap.docs[0].id;

    await db
      .collection('users').doc(uid)
      .collection('orders').doc(String(order.id))
      .set({
        shopifyId:         String(order.id),
        name:              order.name,
        email:             email,
        total:             order.total_price,
        currency:          order.currency,
        financialStatus:   order.financial_status,
        fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
        statusUrl:         order.order_status_url,
        createdAt:         new Date(order.created_at),
        items: (order.line_items || []).map(item => ({
          title:    item.title,
          vendor:   item.vendor || '',
          quantity: item.quantity,
          price:    item.price,
          image:    item.image ? item.image.src : null
        }))
      }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
