import { describe, it, expect } from 'vitest';
import { ParseJobRepository } from './parse-job-repository.js';

describe('ParseJobRepository.isValidTransition', () => {
  const valid: [string, string][] = [
    ['queued', 'processing'],
    ['queued', 'failed'],
    ['processing', 'review_pending'],
    ['processing', 'failed'],
    ['review_pending', 'confirmed'],
    ['review_pending', 'failed'],
  ];

  const invalid: [string, string][] = [
    ['queued', 'review_pending'],
    ['queued', 'confirmed'],
    ['processing', 'queued'],
    ['processing', 'confirmed'],
    ['review_pending', 'queued'],
    ['review_pending', 'processing'],
    ['confirmed', 'queued'],
    ['confirmed', 'failed'],
    ['failed', 'queued'],
    ['failed', 'processing'],
  ];

  it.each(valid)('allows %s → %s', (from, to) => {
    expect(ParseJobRepository.isValidTransition(from as any, to as any)).toBe(true);
  });

  it.each(invalid)('rejects %s → %s', (from, to) => {
    expect(ParseJobRepository.isValidTransition(from as any, to as any)).toBe(false);
  });
});
