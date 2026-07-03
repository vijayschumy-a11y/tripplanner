// Pluggable OTP delivery. Channel is chosen by whichever env is configured:
//   1. FAST2SMS_API_KEY        -> Fast2SMS OTP route (India, no DLT needed)  [preferred]
//   2. TWILIO_WHATSAPP_FROM    -> WhatsApp via Twilio (no India DLT)
//   3. TWILIO_FROM             -> SMS via Twilio (India needs DLT)
//   4. none                    -> demo mode (code returned to client + logged)

const FAST2SMS_KEY = process.env.FAST2SMS_API_KEY;
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const SMS_FROM = process.env.TWILIO_FROM;

let CHANNEL = null;
if (FAST2SMS_KEY) CHANNEL = 'fast2sms';
else if (SID && TOKEN && WHATSAPP_FROM) CHANNEL = 'whatsapp';
else if (SID && TOKEN && SMS_FROM) CHANNEL = 'sms';
const DEMO = !CHANNEL;

export const isDemo = () => DEMO;
export const channel = () => CHANNEL || 'demo';

const e164 = (n) => {
  const d = String(n).replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : '+' + d;
};
// Fast2SMS wants a bare 10-digit Indian number
const indian10 = (n) => {
  let d = String(n).replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(-10);
  return d;
};

// sendOtp(phone, code, message): SMS/WhatsApp use `message`; Fast2SMS OTP route uses `code`.
export async function sendOtp(phone, code, message) {
  if (DEMO) {
    console.log(`[OTP demo] -> ${phone}: ${message}`);
    return { demo: true };
  }
  if (CHANNEL === 'fast2sms') return fast2sms(phone, code);
  return twilio(phone, message);
}

async function fast2sms(phone, code) {
  const numbers = indian10(phone);
  if (numbers.length !== 10) throw new Error('Fast2SMS supports Indian 10-digit mobile numbers only');
  const body = new URLSearchParams({ variables_values: code, route: 'otp', numbers });
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: FAST2SMS_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  const failed = !res.ok || data.return === false;
  if (failed) {
    const msg = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new Error(msg || `Fast2SMS error ${res.status}`);
  }
  return { demo: false, channel: 'fast2sms', request_id: data.request_id };
}

async function twilio(phone, message) {
  const from = CHANNEL === 'whatsapp'
    ? 'whatsapp:' + e164(WHATSAPP_FROM.replace(/^whatsapp:/, ''))
    : e164(SMS_FROM);
  const to = CHANNEL === 'whatsapp' ? 'whatsapp:' + e164(phone) : e164(phone);
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
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return { demo: false, channel: CHANNEL, sid: data.sid };
}
