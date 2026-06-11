import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkSocketSpam,
  evaluateTextSafety,
  extractLinks,
  normalizeForSafety,
} from '../contentSafety.js';

describe('content safety helpers', () => {
  beforeEach(() => {
    delete process.env.CONTENT_BANNED_TERMS;
  });

  it('normalizes text for moderation comparisons', () => {
    expect(normalizeForSafety('  C4fe!!!   CHAT  ')).toBe('cafe chat');
  });

  it('blocks default profanity and configured banned terms', () => {
    expect(evaluateTextSafety('that is shit').allowed).toBe(false);

    process.env.CONTENT_BANNED_TERMS = 'launch-only-blocked-term';
    const decision = evaluateTextSafety('please hide launch-only-blocked-term now');

    expect(decision).toMatchObject({
      allowed: false,
      code: 'banned_term',
    });
  });

  it('detects repeated and excessive links', () => {
    expect(extractLinks('visit https://example.com and www.test.dev')).toEqual([
      'https://example.com',
      'www.test.dev',
    ]);

    expect(evaluateTextSafety('https://a.com https://a.com').code).toBe('repeated_link');
    expect(evaluateTextSafety('a.com b.com c.com d.com', { maxLinks: 3 }).code).toBe('too_many_links');
  });

  it('limits invite and short-link spam by surface', () => {
    const decision = evaluateTextSafety('join discord.gg/example', { maxInviteLinks: 0 });
    expect(decision).toMatchObject({
      allowed: false,
      code: 'invite_link_spam',
    });
  });

  it('tracks repeated socket messages and link bursts', () => {
    const socket = {};

    expect(checkSocketSpam(socket, 'room', 'same exact message', 1000).allowed).toBe(true);
    expect(checkSocketSpam(socket, 'room', 'same exact message', 2000).allowed).toBe(true);
    expect(checkSocketSpam(socket, 'room', 'same exact message', 3000)).toMatchObject({
      allowed: false,
      code: 'repeated_message',
    });

    const linkSocket = {};
    expect(checkSocketSpam(linkSocket, 'room', 'https://a.com', 1000).allowed).toBe(true);
    expect(checkSocketSpam(linkSocket, 'room', 'https://b.com', 2000).allowed).toBe(true);
    expect(checkSocketSpam(linkSocket, 'room', 'https://c.com', 3000)).toMatchObject({
      allowed: false,
      code: 'link_burst',
    });
  });
});
