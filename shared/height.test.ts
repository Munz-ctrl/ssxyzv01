import { describe, expect, it } from 'vitest';
import { heightFromCm, heightFromFeet, heightLabel } from './height.js';

describe('height', () => {
  it('reads feet and inches', () => {
    expect(heightFromFeet('5', '11')).toBeCloseTo(1.803, 3);
    expect(heightFromFeet('4', '9')).toBeCloseTo(1.448, 3);
    expect(heightFromFeet('6', '')).toBeCloseTo(1.829, 3);
  });

  it('reads cm', () => {
    expect(heightFromCm('180')).toBe(1.8);
  });

  it('rejects heights no person has', () => {
    expect(heightFromFeet('5', '12')).toBeNull();
    expect(heightFromFeet('9', '0')).toBeNull();
    expect(heightFromCm('50')).toBeNull();
    expect(heightFromCm('abc')).toBeNull();
  });

  it('labels both units', () => {
    expect(heightLabel(1.803)).toBe(`5'11" / 180 cm`);
  });
});
