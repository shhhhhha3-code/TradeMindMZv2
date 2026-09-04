import {
  loadTrackedPositions,
  saveTrackedPositions,
} from "./positionStorage.js";

import {
  calculatePositionPerformance,
} from "./positionModel.js";

/**
 * Update tracked positions using current
 * Pionex/read-only market information.
 *
 * No orders are created.
 */

export function refreshTrackedPositions(
  marketPrices = {}
) {
  const positions =
    loadTrackedPositions();

  const updated =
    positions.map((position) => {
      const currentPrice =
        Number(
          marketPrices[
            position.symbol
          ]
        );

      if (
        !Number.isFinite(
          currentPrice
        )
      ) {
        return position;
      }

      const performance =
        calculatePositionPerformance({
          side: position.side,
          entryPrice:
            position.entryPrice,
          currentPrice,
        });

      return {
        ...position,

        currentPrice,

        unrealizedPercent:
          performance ?? 0,

        updatedAt:
          new Date().toISOString(),
      };
    });

  saveTrackedPositions(updated);

  return updated;
}
