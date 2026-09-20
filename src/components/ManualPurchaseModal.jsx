import React, { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";

export default function ManualPurchaseModal({
  open = false,
  onClose,
  onSave,
  initialValues = {},
}) {
  const [symbol, setSymbol] =
    useState(initialValues.symbol || "BTCUSDT");

  const [side, setSide] =
    useState(initialValues.side || "LONG");

  const [entryPrice, setEntryPrice] =
    useState(initialValues.entryPrice ?? "");

  const [quantity, setQuantity] =
    useState("");

  const [stopLoss, setStopLoss] =
    useState(initialValues.stopLoss ?? "");

  const [takeProfit, setTakeProfit] =
    useState(initialValues.takeProfit ?? "");

  const [holdTimeMinMinutes, setHoldTimeMinMinutes] =
    useState(initialValues.holdTimeMinMinutes ?? 0);

  const [holdTimeMaxMinutes, setHoldTimeMaxMinutes] =
    useState(initialValues.holdTimeMaxMinutes ?? 0);

  const [holdTimeReason, setHoldTimeReason] =
    useState(initialValues.holdTimeReason ?? "");

  useEffect(() => {
    if (!open) return;

    if (initialValues.symbol !== undefined) {
      setSymbol(initialValues.symbol);
    }

    if (initialValues.side !== undefined) {
      setSide(initialValues.side);
    }

    if (initialValues.entryPrice !== undefined) {
      setEntryPrice(initialValues.entryPrice);
    }

    if (initialValues.stopLoss !== undefined) {
      setStopLoss(initialValues.stopLoss);
    }

    if (initialValues.takeProfit !== undefined) {
      setTakeProfit(initialValues.takeProfit);
    }

    setHoldTimeMinMinutes(initialValues.holdTimeMinMinutes ?? 0);
    setHoldTimeMaxMinutes(initialValues.holdTimeMaxMinutes ?? 0);
    setHoldTimeReason(initialValues.holdTimeReason ?? "");
  }, [
    open,
    initialValues.symbol,
    initialValues.side,
    initialValues.entryPrice,
    initialValues.stopLoss,
    initialValues.takeProfit,
    initialValues.holdTimeMinMinutes,
    initialValues.holdTimeMaxMinutes,
    initialValues.holdTimeReason,
  ]);

  if (!open) {
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();

    const price =
      Number(entryPrice);

    const qty =
      Number(quantity);

    if (
      !symbol ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(qty) ||
      qty <= 0
    ) {
      return;
    }

    onSave({
      symbol:
        symbol.trim().toUpperCase(),

      side,

      marketType:
        String(initialValues.marketType || "PERP").toUpperCase() === "SPOT"
          ? "SPOT"
          : "PERP",

      entryPrice: price,

      quantity: qty,

      stopLoss:
        Number.isFinite(
          Number(stopLoss)
        )
          ? Number(stopLoss)
          : null,

      takeProfit:
        Number.isFinite(
          Number(takeProfit)
        )
          ? Number(takeProfit)
          : null,

      

      holdTimeMinMinutes:
        Number.isFinite(Number(holdTimeMinMinutes))
          ? Number(holdTimeMinMinutes)
          : 0,

      holdTimeMaxMinutes:
        Number.isFinite(Number(holdTimeMaxMinutes))
          ? Number(holdTimeMaxMinutes)
          : 0,

      holdTimeReason:
        holdTimeReason || "",

      source:
        "MANUAL_PIONEX",
    });

    setEntryPrice("");
    setQuantity("");
    setStopLoss("");
    setTakeProfit("");

    onClose();
  }

  return (
    <div className="manual-purchase-overlay">

      <div className="manual-purchase-modal">

        <div className="manual-purchase-header">

          <div>
            <strong>
              MARK PIONEX PURCHASE
            </strong>

            <span>
              TradeMindMZ will only track it.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="manual-close-button"
          >
            <X size={18} />
          </button>

        </div>

        <form
          onSubmit={handleSubmit}
          className="manual-purchase-form"
        >

          <label>
            SYMBOL

            <input
              value={symbol}
              onChange={(event) =>
                setSymbol(
                  event.target.value
                )
              }
              placeholder="BTCUSDT"
            />
          </label>

          <label>
            SIDE

            <select
              value={side}
              onChange={(event) =>
                setSide(
                  event.target.value
                )
              }
            >
              <option value="LONG">
                LONG
              </option>

              <option value="SHORT">
                SHORT
              </option>
            </select>
          </label>

          <label>
            ENTRY PRICE

            <input
              type="number"
              step="any"
              value={entryPrice}
              onChange={(event) =>
                setEntryPrice(
                  event.target.value
                )
              }
              placeholder="Entry price"
            />
          </label>

          <label>
            QUANTITY

            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(event) =>
                setQuantity(
                  event.target.value
                )
              }
              placeholder="Quantity"
            />
          </label>

          <div className="manual-purchase-row">

            <label>
              STOP LOSS

              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(event) =>
                  setStopLoss(
                    event.target.value
                  )
                }
                placeholder="Optional"
              />
            </label>

            <label>
              TAKE PROFIT

              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(event) =>
                  setTakeProfit(
                    event.target.value
                  )
                }
                placeholder="Optional"
              />
            </label>

          </div>          {Number(holdTimeMinMinutes) > 0 && (
            <div className="manual-purchase-warning">
              <ShieldCheck size={16} />
              <span>
                AI estimated hold time: {holdTimeMinMinutes}–{holdTimeMaxMinutes} min.
                {holdTimeReason ? " " + holdTimeReason : ""}
              </span>
            </div>
          )}



          <div className="manual-purchase-warning">
            <ShieldCheck size={16} />

            <span>
              This does NOT place a Pionex
              order. It only records a position
              for monitoring.
            </span>
          </div>

          <button
            type="submit"
            className="manual-purchase-submit"
          >
            I BOUGHT THIS — START AI MONITORING
          </button>

        </form>

      </div>

    </div>
  );
}
