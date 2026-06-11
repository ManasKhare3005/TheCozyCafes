const PRODUCT_NAME = 'Chat Room Cafe';

function layout({ title, intro, lines = [], actionLabel, actionUrl, footer }) {
  const text = [
    title,
    '',
    intro,
    '',
    ...lines,
    ...(actionUrl ? ['', `${actionLabel}:`, actionUrl] : []),
    '',
    footer || `Thanks,\n${PRODUCT_NAME}`,
  ].join('\n');

  const safe = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

  const html = [
    '<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#2f241d;max-width:560px;margin:0 auto;padding:24px">',
    `<h1 style="font-family:Georgia,serif;color:#3b2a21">${safe(title)}</h1>`,
    `<p>${safe(intro)}</p>`,
    ...lines.map((line) => `<p>${safe(line)}</p>`),
    actionUrl
      ? `<p><a href="${safe(actionUrl)}" style="display:inline-block;background:#5f4334;color:white;padding:12px 18px;border-radius:10px;text-decoration:none">${safe(actionLabel)}</a></p>`
      : '',
    `<p style="color:#7d695c;font-size:13px;white-space:pre-line">${safe(footer || `Thanks,\n${PRODUCT_NAME}`)}</p>`,
    '</div>',
  ].join('');

  return { text, html };
}

export function renderEmailTemplate(name, data = {}) {
  if (name === 'welcome') {
    return {
      subject: `Welcome to ${PRODUCT_NAME}`,
      ...layout({
        title: `Welcome, ${data.username || 'friend'}`,
        intro: 'Your cafe table is ready.',
        lines: [
          'Create a room, invite a friend, or try Empty Chair when you want a low-pressure chat with someone new.',
        ],
      }),
    };
  }

  if (name === 'email_verification') {
    return {
      subject: `Verify your ${PRODUCT_NAME} email`,
      ...layout({
        title: 'Verify your email',
        intro: `Hi ${data.username || 'there'}, finish setting up your account with this verification link.`,
        lines: ['This link expires in 24 hours.'],
        actionLabel: 'Verify email',
        actionUrl: data.url,
      }),
    };
  }

  if (name === 'password_reset') {
    return {
      subject: `Reset your ${PRODUCT_NAME} password`,
      ...layout({
        title: 'Reset your password',
        intro: `Hi ${data.username || 'there'}, use this link to choose a new password.`,
        lines: ['This link expires in 1 hour. If you did not request it, you can ignore this email.'],
        actionLabel: 'Reset password',
        actionUrl: data.url,
      }),
    };
  }

  if (name === 'safety_notice') {
    return {
      subject: `${PRODUCT_NAME} safety notice`,
      ...layout({
        title: 'Safety notice',
        intro: `Hi ${data.username || 'there'}, a moderation action was taken on your account or content.`,
        lines: [
          data.reason ? `Reason: ${data.reason}` : 'Reason: moderation policy violation',
          'Reply to the support address in the moderation policy if you believe this was a mistake.',
        ],
      }),
    };
  }

  throw new Error(`Unknown email template: ${name}`);
}
