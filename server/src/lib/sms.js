// Pluggable OTP delivery via Twilio.
// Channel is chosen by env:
//   - TWILIO_WHATSAPP_FROM set  -> send over WhatsApp (no India DLT needed)
//   - TWILIO_FROM set           -> send over SMS
//   - neither / no creds        -> demo mode (code returned to client + logged)

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const SMS_FROM = process.env.TWILIO_FROM;

const CHANNEL = WHATSAPP_FROM ? 'whatsapp' : SMS_FROM ? 'sms' : null;
const DEMO = !(SID && TOKEN && CHANNEL);

export const isDemo = () => DEMO;
export const channel = () => (DEMO ? 'demo' : CHANNEL);

const e164 = (n) => {
  const digits = String(n).replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : '+' + digits;
};

export async function sendOtp(phone, message) {
  if (DEMO) {
    console.log(`[OTP demo] -> ${phone}: ${message}`);
    return { demo: true };
  }

  let from, to;
  if (CHANNEL === 'whatsapp') {
    from = 'whatsapp:' + e164(WHATSAPP_FROM.replace(/^whatsapp:/, ''));
    to = 'whatsapp:' + e164(phone);
  } else {
    from = e164(SMS_FROM);
    to = e164(phone);
  }

  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface Twilio's own message (e.g. "number not in sandbox", "unverified")
    throw new Error(data.message || `Twilio error ${res.status}`);
  }
  return { demo: false, sid: data.sid, channel: CHANNEL };
}
