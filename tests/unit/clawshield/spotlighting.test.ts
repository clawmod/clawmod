import { describe, test, expect } from 'vitest';
import { Spotlighter } from '../../../src/modules/clawshield/spotlighting';

describe('Spotlighter', () => {
  describe('mark', () => {
    test('marks content with default markers', () => {
      const spotlighter = new Spotlighter();
      const result = spotlighter.mark('hello world');
      expect(result).toContain('«UNTRUSTED_START»');
      expect(result).toContain('«UNTRUSTED_END»');
      expect(result).toContain('hello world');
    });

    test('inserts inline markers at intervals', () => {
      const spotlighter = new Spotlighter({ tokenInterval: 2 });
      const result = spotlighter.mark('one two three four');
      expect(result).toContain('«»');
      // After 2 words (one, two), should have inline marker
      expect(result).toMatch(/one\s+two«»/);
    });

    test('handles empty content', () => {
      const spotlighter = new Spotlighter();
      expect(spotlighter.mark('')).toBe('');
    });

    test('handles disabled mode', () => {
      const spotlighter = new Spotlighter({ enabled: false });
      const result = spotlighter.mark('hello world');
      expect(result).toBe('hello world');
    });

    test('uses custom markers', () => {
      const spotlighter = new Spotlighter({
        startMarker: '[START]',
        endMarker: '[END]',
        inlineMarker: '[.]'
      });
      const result = spotlighter.mark('hello world');
      expect(result).toContain('[START]');
      expect(result).toContain('[END]');
      expect(result).not.toContain('«UNTRUSTED_START»');
    });

    test('handles whitespace correctly', () => {
      const spotlighter = new Spotlighter();
      const result = spotlighter.mark('hello   world');
      expect(result).toContain('hello   world');
    });

    test('marks long content with multiple inline markers', () => {
      const spotlighter = new Spotlighter({ tokenInterval: 2 });
      const result = spotlighter.mark('one two three four five six seven eight');
      // Should have markers after words 2, 4, 6, 8
      const markerCount = (result.match(/«»/g) || []).length;
      expect(markerCount).toBe(4);
    });

    test('handles single word', () => {
      const spotlighter = new Spotlighter();
      const result = spotlighter.mark('hello');
      expect(result).toBe('«UNTRUSTED_START»hello«UNTRUSTED_END»');
    });
  });

  describe('unmark', () => {
    test('removes all markers from marked content', () => {
      const spotlighter = new Spotlighter();
      const marked = spotlighter.mark('hello world');
      const unmarked = spotlighter.unmark(marked);
      expect(unmarked).toBe('hello world');
    });

    test('handles empty content', () => {
      const spotlighter = new Spotlighter();
      expect(spotlighter.unmark('')).toBe('');
    });

    test('handles unmarked content', () => {
      const spotlighter = new Spotlighter();
      const result = spotlighter.unmark('plain text');
      expect(result).toBe('plain text');
    });

    test('removes custom markers', () => {
      const spotlighter = new Spotlighter({
        startMarker: '[START]',
        endMarker: '[END]',
        inlineMarker: '[.]'
      });
      const marked = spotlighter.mark('hello world');
      const unmarked = spotlighter.unmark(marked);
      expect(unmarked).toBe('hello world');
    });

    test('handles special regex characters in markers', () => {
      const spotlighter = new Spotlighter({
        startMarker: '(START)',
        endMarker: '(END)',
        inlineMarker: '(.)'
      });
      const marked = spotlighter.mark('hello');
      const unmarked = spotlighter.unmark(marked);
      expect(unmarked).toBe('hello');
    });
  });

  describe('isMarked', () => {
    test('detects marked content', () => {
      const spotlighter = new Spotlighter();
      const marked = spotlighter.mark('hello');
      expect(spotlighter.isMarked(marked)).toBe(true);
    });

    test('returns false for unmarked content', () => {
      const spotlighter = new Spotlighter();
      expect(spotlighter.isMarked('plain text')).toBe(false);
    });

    test('detects start marker', () => {
      const spotlighter = new Spotlighter();
      expect(spotlighter.isMarked('«UNTRUSTED_START»text')).toBe(true);
    });

    test('detects end marker', () => {
      const spotlighter = new Spotlighter();
      expect(spotlighter.isMarked('text«UNTRUSTED_END»')).toBe(true);
    });

    test('detects custom markers', () => {
      const spotlighter = new Spotlighter({
        startMarker: '[START]',
        endMarker: '[END]'
      });
      expect(spotlighter.isMarked('[START]text[END]')).toBe(true);
    });

    test('does not detect inline markers alone', () => {
      const spotlighter = new Spotlighter();
      expect(spotlighter.isMarked('text«»more')).toBe(false);
    });
  });

  describe('configuration', () => {
    test('uses default token interval of 5', () => {
      const spotlighter = new Spotlighter();
      const result = spotlighter.mark('one two three four five six');
      // Should have marker after 5 words
      expect(result).toContain('«»');
    });

    test('respects custom token interval', () => {
      const spotlighter = new Spotlighter({ tokenInterval: 3 });
      const result = spotlighter.mark('one two three four');
      const markerCount = (result.match(/«»/g) || []).length;
      expect(markerCount).toBe(1); // After word 3
    });

    test('enabled defaults to true', () => {
      const spotlighter = new Spotlighter({});
      const result = spotlighter.mark('hello');
      expect(result).toContain('«UNTRUSTED_START»');
    });
  });
});
