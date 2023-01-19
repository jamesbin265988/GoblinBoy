import { Position } from "../utility/types";

// Game config
export const TILE_SIZE = 24;

export const CAMERA_RADIUS = 3;
export const CAMERA_SIZE = CAMERA_RADIUS * 2 + 1;

export interface Camera {
  x: number;
  y: number;
}

export const camera: Camera = { x: 0, y: 0 };

export const setCamera = (pos: Position) => {
  let newX = pos.x - CAMERA_RADIUS;
  let newY = pos.y - CAMERA_RADIUS;

  camera.x = newX;
  camera.y = newY;
};

export const mapPosToScreenPos = (mapPos: Position): Position => {
  return {
    x: mapPos.x - camera.x,
    y: mapPos.y - camera.y,
  };
};

export const screenPosToMapPos = (screenPos: Position): Position => {
  return {
    x: screenPos.x + camera.x,
    y: screenPos.y + camera.y,
  };
};