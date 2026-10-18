"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, AlertCircle, Pill } from "lucide-react";

export default function PharmacyPrices({ prescriptionId }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);

  const startPriceCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agents/prices/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescription_id: prescriptionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to start price check");
        console.error("Price check start error:", data);
      } else {
        setStarted(true);
        console.log("Price check started:", data);
      }
    } catch (err) {
      setError("Failed to start price check");
      console.error("Price check exception:", err);
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async () => {
    try {
      const res = await fetch(`/api/agents/prices/status?prescription_id=${prescriptionId}`);
      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
        console.log("Price status:", data);
      } else {
        console.error("Price status error:", data);
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
  };

  useEffect(() => {
    if (!prescriptionId) return;

    // Start on mount
    startPriceCheck();

    // Poll every 3 seconds
    const interval = setInterval(() => {
      pollStatus();
    }, 3000);

    // Stop after 90 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setLoading(false);
    }, 90000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptionId]);

  if (!results) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Checking pharmacies...</span>
            </>
          ) : error ? (
            <>
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span className="text-rose-600">{error}</span>
            </>
          ) : (
            <>
              <Pill className="w-4 h-4 text-brand-emerald" />
              <span>Checking pharmacy prices...</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // Debug: Show mock data if no real results (for demo purposes)
  const medicineKeys = Object.keys(results);

  if (medicineKeys.length === 0) {
    // Return mock data for demo
    const mockResults = {
      "paracetamol 500mg": [
        {
          pharmacy: "1mg",
          product_name: "Paracetamol 500mg Tablet",
          price_inr: 25,
          pack_size: "15 tablets",
          in_stock: true,
          product_url: "https://www.1mg.com",
          cached: false,
          age_hours: 0,
        },
        {
          pharmacy: "PharmEasy",
          product_name: "Paracetamol 500mg",
          price_inr: 22,
          pack_size: "15 tablets",
          in_stock: true,
          product_url: "https://pharmeasy.in",
          cached: false,
          age_hours: 0,
        },
        {
          pharmacy: "Netmeds",
          product_name: "Paracetamol 500mg Tablet",
          price_inr: 28,
          pack_size: "15 tablets",
          in_stock: false,
          product_url: "https://www.netmeds.com",
          cached: false,
          age_hours: 0,
        },
      ],
    };

    return (
      <div className="mt-4 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <strong>Demo Mode:</strong> Showing mock prices. Configure TINYFISH_API_KEY for real data.
        </div>
        {Object.entries(mockResults).map(([medicineKey, prices]) => (
          <div key={medicineKey} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <h5 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Pill className="w-3.5 h-3.5 text-brand-emerald" />
              {medicineKey}
            </h5>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Pharmacy</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Product</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Pack Size</th>
                    <th className="text-right py-2 px-2 font-semibold text-slate-600">Price (₹)</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-600">Stock</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-600">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((price, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{price.pharmacy}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-600">{price.product_name}</td>
                      <td className="py-2 px-2 text-slate-600">{price.pack_size || "N/A"}</td>
                      <td className="py-2 px-2 text-right font-bold text-slate-900">₹{price.price_inr}</td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${price.in_stock
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                            }`}
                        >
                          {price.in_stock ? "In Stock" : "Out of Stock"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {price.product_url ? (
                          <a
                            href={price.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-emerald hover:underline"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-slate-400 italic pt-2">
          Prices are indicative, taken from public pharmacy websites.
        </p>
      </div>
    );
  }

  // Real results from TinyFish - medicineKeys already defined above
  if (medicineKeys.length === 0) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <p className="text-xs text-slate-500">
          No price results available yet. This requires the TinyFish API key to be configured.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {medicineKeys.map((medicineKey) => {
        const prices = results[medicineKey];
        if (!prices || prices.length === 0) return null;

        return (
          <div key={medicineKey} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <h5 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Pill className="w-3.5 h-3.5 text-brand-emerald" />
              {medicineKey}
            </h5>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Pharmacy</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Product</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Pack Size</th>
                    <th className="text-right py-2 px-2 font-semibold text-slate-600">Price (₹)</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-600">Stock</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-600">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((price, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{price.pharmacy}</span>
                          {price.cached && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-600">
                              Cached ({price.age_hours}h)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-600">{price.product_name}</td>
                      <td className="py-2 px-2 text-slate-600">{price.pack_size || "N/A"}</td>
                      <td className="py-2 px-2 text-right font-bold text-slate-900">₹{price.price_inr}</td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${price.in_stock
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                            }`}
                        >
                          {price.in_stock ? "In Stock" : "Out of Stock"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {price.product_url ? (
                          <a
                            href={price.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-emerald hover:underline"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400 italic pt-2">
        Prices are indicative, taken from public pharmacy websites.
      </p>
    </div>
  );
}
