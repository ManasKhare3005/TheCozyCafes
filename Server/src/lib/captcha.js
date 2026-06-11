const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

export async function verifyCaptchaToken(captchaToken, remoteIp) {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) return true;

  if (!captchaToken || typeof captchaToken !== 'string') {
    return false;
  }

  const body = new URLSearchParams({
    secret,
    response: captchaToken,
  });

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) return false;
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('CAPTCHA verification error:', error);
    return false;
  }
}
