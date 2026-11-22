import cam from '../../config/camera.json';

// Every camera, scale and room number comes from config/camera.json.

const RAD = Math.PI / 180;
export const YAW = cam.yaw_deg * RAD;
export const TILT = -cam.tilt_deg * RAD; // config says -33 (looking down); this is the positive downward angle

export const ROOM = {
  width: cam.room.size_m[0],
  depth: cam.room.size_m[1],
  wallHeight: cam.room.wall_height_m,
  wallThickness: cam.room.wall_thickness_m,
};

export const FLOOR = cam.floor;

export const PROXY = { width: cam.player_proxy_m[0], depth: cam.player_proxy_m[1], height: cam.player_proxy_m[2] };

// CSS pixels per meter. Portrait when width <= height.
export function pxPerMeter(width: number, height: number): number {
  const p = width <= height ? cam.px_per_meter.portrait : cam.px_per_meter.landscape;
  return (width * p.value) / p.at_width;
}

// Unit vector from the target toward the camera: yaw around the vertical axis, tilted down.
export function cameraDirection(): [number, number, number] {
  const flat = Math.cos(TILT);
  return [flat * Math.sin(YAW), Math.sin(TILT), flat * Math.cos(YAW)];
}

// Screen space (x right, y up) of a world point under this camera, in meters. Used for checks.
export function project([x, y, z]: [number, number, number]): [number, number] {
  const [dx, dy, dz] = cameraDirection();
  // right = up(0,1,0) x forward(toward camera), normalized; up' = forward x right
  const rx = dz, rz = -dx;
  const rl = Math.hypot(rx, rz);
  const right: [number, number, number] = [rx / rl, 0, rz / rl];
  const up: [number, number, number] = [
    dy * right[2] - dz * right[1],
    dz * right[0] - dx * right[2],
    dx * right[1] - dy * right[0],
  ];
  return [x * right[0] + y * right[1] + z * right[2], x * up[0] + y * up[1] + z * up[2]];
}

// Screen angle of a floor line in degrees (expect about 28.5).
export function floorLineAngle(): number {
  const [x, y] = project([1, 0, 0]);
  return Math.atan2(Math.abs(y), Math.abs(x)) / RAD;
}

// Room tiles are counted from the back corner: tile (0, 0) touches both walls.
export function tileCenter(i: number, j: number): [number, number] {
  return [i - ROOM.width / 2 + 0.5, j - ROOM.depth / 2 + 0.5];
}

export const AVATAR = cam.avatar;

// The avatar is a vertical plane facing the camera. Its person spans person_height_px of the
// canvas and must stand person_height_m tall, so the full plane is canvas / person * height.
export function avatarPlane() {
  const [cw, ch] = AVATAR.canvas_px;
  const [ax, ay] = AVATAR.anchor_px;
  const height = (ch / AVATAR.person_height_px) * AVATAR.person_height_m;
  const width = (height * cw) / ch;
  // offset of the plane center from the feet anchor, in plane space (y up)
  return { width, height, offsetX: (0.5 - ax / cw) * width, offsetY: (ay / ch - 0.5) * height };
}
