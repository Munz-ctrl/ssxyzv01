import { describe, expect, it } from 'vitest';
import { getSun, LIGHT_UNIFORMS, setSun, SUN_DEFAULT, sunDirection } from './light';

describe('sun', () => {
  it('points straight down at elevation 90 and along +z at azimuth 90', () => {
    const down = sunDirection(0, 90);
    expect(down.y).toBeCloseTo(1);
    const side = sunDirection(90, 0);
    expect(side.z).toBeCloseTo(1);
    expect(side.x).toBeCloseTo(0);
  });

  it('lights the floor at exactly its own color with the default sun', () => {
    setSun(SUN_DEFAULT);
    const { uAmbient, uSun, uLight } = LIGHT_UNIFORMS;
    expect(uAmbient.value + uSun.value * uLight.value.y).toBeCloseTo(1, 6);
  });

  it('moves every shared uniform when the sun moves', () => {
    setSun({ elevation: 10 });
    expect(getSun().elevation).toBe(10);
    expect(LIGHT_UNIFORMS.uLight.value.y).toBeCloseTo(Math.sin((10 * Math.PI) / 180));
    setSun(SUN_DEFAULT);
  });
});
