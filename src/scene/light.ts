import { Vector3 } from 'three';
import cam from '../../config/camera.json';

// The room's one sun (config/camera.json `light`): infinitely far, the same direction everywhere,
// no falloff, no cast shadows yet. Every surface shader shares these uniform objects, so moving
// the sun relights the floor and every wall at once.

export interface Sun {
  azimuth: number; // degrees around the room, 0 = from +x, 90 = from +z
  elevation: number; // degrees above the floor, 90 = straight down
  sun: number;
  ambient: number;
}

export const SUN_DEFAULT: Sun = {
  azimuth: cam.light.azimuth_deg,
  elevation: cam.light.elevation_deg,
  sun: cam.light.sun,
  ambient: cam.light.ambient,
};

const rad = (d: number) => (d * Math.PI) / 180;

export function sunDirection(azimuthDeg: number, elevationDeg: number, out = new Vector3()): Vector3 {
  const az = rad(azimuthDeg);
  const el = rad(elevationDeg);
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

// Fixed exposure: at the default sun the floor shows exactly floor.color (the brand gray).
export const EXPOSURE = SUN_DEFAULT.ambient + SUN_DEFAULT.sun * Math.max(0, Math.sin(rad(SUN_DEFAULT.elevation)));

export const LIGHT_UNIFORMS = {
  uLight: { value: new Vector3() },
  uAmbient: { value: 0 },
  uSun: { value: 0 },
};

let current: Sun = { ...SUN_DEFAULT };
const listeners = new Set<() => void>();

function apply() {
  sunDirection(current.azimuth, current.elevation, LIGHT_UNIFORMS.uLight.value);
  LIGHT_UNIFORMS.uAmbient.value = current.ambient / EXPOSURE;
  LIGHT_UNIFORMS.uSun.value = current.sun / EXPOSURE;
}
apply();

export const getSun = () => current;

export function setSun(next: Partial<Sun>) {
  current = { ...current, ...next };
  apply();
  listeners.forEach((l) => l());
}

export function subscribeSun(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
