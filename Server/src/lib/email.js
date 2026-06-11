const RESEND_EMAIL_URL = 'https://api.resend.com/emails';

function textToHtml(text) {
  return text
    .split('\n')
    .map((line) => `<p>${line.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]))}</p>`)
    .join('');
}

export async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(`[email:dev] ${subject} -> ${to}\n${text}`);
    return { delivered: false };
  }

  const response = await fetch(RESEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html: html || textToHtml(text),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider error: ${response.status} ${detail}`);
  }

  return { delivered: true };
}
