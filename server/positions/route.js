import express from "express";

import {
  savePositionToSupabase,
  getTrackedPositionsFromSupabase,
  updatePositionInSupabase,
} from "./positionService.js";

const router = express.Router();

/*
 * TradeMindMZ position API
 *
 * IMPORTANT:
 * - Records manually opened Pionex positions.
 * - Reads tracked positions.
 * - Updates monitoring data.
 * - NEVER creates, closes or modifies Pionex orders.
 */

router.get("/", async (req, res) => {
  try {
    const positions =
      await getTrackedPositionsFromSupabase({
        userId: req.query.userId || null,
        status:
          req.query.status === undefined
            ? "LIVE"
            : req.query.status,
      });

    res.json({
      success: true,
      positions,
    });
  } catch (error) {
    console.error("Supabase positions GET failed:", error);

    res.status(500).json({
      success: false,
      error: error.message,
      positions: [],
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const position = await savePositionToSupabase(
      req.body
    );

    res.status(201).json({
      success: true,
      position,
      status: "POSITION_SAVED",
    });
  } catch (error) {
    console.error("Supabase position POST failed:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const position =
      await updatePositionInSupabase(
        req.params.id,
        req.body
      );

    res.json({
      success: true,
      position,
      status: "POSITION_UPDATED",
    });
  } catch (error) {
    console.error(
      "Supabase position PATCH failed:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
