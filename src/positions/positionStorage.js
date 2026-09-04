const STORAGE_KEY =
  "trademindmz-live-positions";

export function loadTrackedPositions() {
  try {
    const data =
      JSON.parse(
        localStorage.getItem(STORAGE_KEY) ||
        "[]"
      );

    return Array.isArray(data)
      ? data
      : [];

  } catch {
    return [];
  }
}

export function saveTrackedPositions(
  positions = []
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(positions)
  );
}

export function addTrackedPosition(
  position
) {
  const positions =
    loadTrackedPositions();

  const next = [
    ...positions,
    position,
  ];

  saveTrackedPositions(next);

  return next;
}

export function removeTrackedPosition(
  positionId
) {
  const positions =
    loadTrackedPositions();

  const next =
    positions.filter(
      (position) =>
        position.id !== positionId
    );

  saveTrackedPositions(next);

  return next;
}

export function updateStoredPosition(
  positionId,
  updates
) {
  const positions =
    loadTrackedPositions();

  const next =
    positions.map((position) =>
      position.id === positionId
        ? {
            ...position,
            ...updates,
            updatedAt:
              new Date().toISOString(),
          }
        : position
    );

  saveTrackedPositions(next);

  return next;
}
