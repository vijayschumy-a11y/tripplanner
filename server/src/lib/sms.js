// Pluggable OTP delivery.
// Real SMS via Twilio when TWILIO_* env vars are set; otherwise "demo mode"
// where the code is returned to the client and printed to the server log.

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;

const DEMO = !(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

export const isDemo = () => DEMO;

export async function sendSms(phone, message) {
  if (DEMO) {
    console.log(`[OTP demo] -> ${phone}: ${message}`);
    return { demo: true };
  }
  const to = phone.startsWith('+') ? phone : '+' + phone;
  const body = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('SMS provider error: ' + t.slice(0, 120));
  }
  return { demo: false };
}
