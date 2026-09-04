import express from "express";
import {
  getSupabaseClient,
  getSupabaseStatus,
} from "./client.js";

const router = express.Router();

router.get("/status", async (_req, res) => {
  const status = getSupabaseStatus();

  if (!status.configured) {
    return res.json({
      ok: false,
      provider: "supabase",
      status: "NOT_CONFIGURED",
      ...status,
    });
  }

  try {
    const supabase = getSupabaseClient();

    /*
     * Lightweight connectivity test.
     *
     * We intentionally do not depend on a specific application table here.
     * Supabase itself must be reachable before application tables are tested.
     */
    const { error } = await supabase
      .from("trademindmz_health")
      .select("id")
      .limit(1);

    if (error) {
      return res.status(200).json({
        ok: false,
        provider: "supabase",
        status: "CONNECTED_BUT_TABLE_TEST_FAILED",
        ...status,
        error: error.message,
      });
    }

    return res.json({
      ok: true,
      provider: "supabase",
      status: "CONNECTED",
      ...status,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      provider: "supabase",
      status: "CONNECTION_FAILED",
      ...status,
      error: error.message,
    });
  }
});

export default router;
