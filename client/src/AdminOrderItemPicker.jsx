import { useEffect, useState } from "react";
import { fetchAdminOfferings, fetchBookedItems } from "./lib/api";

export default function AdminOrderItemPicker({ offeringId, items, menuItems, onAdd }) {
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    setAvailability(null);
    setError("");

    async function refresh() {
      if (refreshing || document.hidden) return;
      refreshing = true;
      try {
        const [orders, bookings] = await Promise.all([fetchAdminOfferings(), fetchBookedItems()]);
        if (cancelled) return;
        // Only this saved order is exempt; removing an item in the editor
        // must still let the admin add it back before saving.
        const takenItems = (orders.offerings || [])
          .filter((offering) => offering.status !== "cancelled" && offering.id !== offeringId)
          .flatMap((offering) => offering.items || []);
        setAvailability({
          ids: new Set([
            ...takenItems.flatMap((item) => [item.id, item.item_id]).filter(Boolean),
            ...(bookings.held_item_ids || []),
            ...(bookings.held_by_session_ids || []),
          ]),
          // Match the server's name check for older orders with different IDs.
          names: new Set(takenItems.map((item) => item.name).filter(Boolean)),
        });
        setError("");
      } catch {
        if (cancelled) return;
        setAvailability(null);
        setError("Unable to check item availability. Please try again.");
      } finally {
        refreshing = false;
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [offeringId, retry]);

  const selectedIds = new Set(items.flatMap((item) => [item.id, item.item_id]).filter(Boolean));
  const selectedNames = new Set(items.map((item) => item.name).filter(Boolean));
  const query = search.trim().toLowerCase();
  const results = availability && query
    ? menuItems.filter((item) =>
        !selectedIds.has(item.id) && !selectedNames.has(item.name)
        && !availability.ids.has(item.id) && !availability.names.has(item.name)
        && `${item.name} ${item.category} ${item.subcategory}`.toLowerCase().includes(query)
      ).slice(0, 30)
    : [];

  return (
    <div className="field-card admin-order-item-search">
      <label htmlFor="admin-order-item-search"><span>Add Item</span></label>
      <input className="admin-search" id="admin-order-item-search" onChange={(event) => setSearch(event.target.value)} placeholder="Search by item, category, or subcategory" type="search" value={search} />
      {error ? (
        <div role="alert">
          {error} <button className="mini-button" onClick={() => setRetry((value) => value + 1)} type="button">Retry</button>
        </div>
      ) : !availability ? <span role="status">Checking item availability...</span> : query ? (
        <div className="admin-order-search-results">
          {results.length ? results.map((item) => (
            <button key={item.id} onClick={() => { onAdd(item); setSearch(""); }} type="button">
              <strong>{item.name}</strong><span>{item.category} - {item.subcategory}</span>
            </button>
          )) : <p role="status">No available items match your search.</p>}
        </div>
      ) : null}
    </div>
  );
}
