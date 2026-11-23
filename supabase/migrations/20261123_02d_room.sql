-- Brief 02d: walls and surfaces.
-- Munzir applies this. The app still loads without it (the room shows the default backdrops),
-- but editing walls and surfaces needs it.

-- The room layout: { walls: [{ edge: [i, j, 'x' | 'z'], height, texture? }], floor_texture?, wall_texture? }.
-- Null = the default room (the two back edges as backdrops). Written only by /api/room (service role).
alter table public.ssx_profiles
  add column room jsonb;
