import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import sevaLightBackground from "./assets/seva-light-bg.png";
import {
  fetchVolunteerAdminAvailability,
  fetchAdminSuggestions,
  fetchVolunteerAvailability,
  fetchProfile,
  saveVolunteerAvailability,
} from "./lib/api";

const availabilityDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function canVolunteerAdmin(permission) {
  return ["super_admin", "volunteer_admin", "both_admin"].includes(permission);
}

function formatTime12(value) {
  if (!value) return "Any time";
  const [hourText, minute = "00"] = String(value).split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function VolunteerShell({ title, subtitle, backTo = "/volunteer", children, wide = false }) {
  const navigate = useNavigate();
  return (
    <div className="app-shell volunteer-shell"><div className={`device-frame ${wide ? "device-frame-wide" : ""}`}><div className="screen screen-paper"><div className="screen-content">
      <header className="screen-header"><div className="screen-header-row"><div className="screen-header-side screen-header-side-left">{backTo ? <button aria-label="Back" className="top-shortcut top-back-button" onClick={() => navigate(backTo)} type="button"><span>&lt;</span></button> : null}</div><h1>{title}</h1><div className="screen-header-side" /></div><div className="gold-line" />{subtitle ? <p className="screen-subtitle">{subtitle}</p> : null}</header>
      {children}
    </div></div></div></div>
  );
}

export function VolunteerHome() {
  return <VolunteerAvailability backTo="/" />;
}

function buildSevaDates() {
  const dates = [];
  for (let date = new Date(2026, 9, 22); date <= new Date(2026, 10, 11); date.setDate(date.getDate() + 1)) {
    dates.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

function displayDate(date, long = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", { weekday: long ? "long" : "short", month: "short", day: "numeric", year: long ? "numeric" : undefined });
}

const sevaDates = buildSevaDates();
const blankSlot = () => ({ from: "08:00", to: "12:00" });

export function VolunteerAvailability({ backTo = "/volunteer" }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedDates, setSelectedDates] = useState([]);
  const [slotsByDate, setSlotsByDate] = useState({});
  const [details, setDetails] = useState({ fullName: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchVolunteerAvailability(), fetchProfile()])
      .then(([availabilityData, profileData]) => {
        const savedDates = availabilityData.availability?.dates || {};
        setSelectedDates(Object.keys(savedDates).filter((date) => sevaDates.includes(date)).sort());
        setSlotsByDate(savedDates);
        setDetails({ fullName: profileData.profile?.full_name || availabilityData.availability?.fullName || "", phone: profileData.profile?.phone || availabilityData.availability?.phone || "" });
      })
      .catch((err) => setError(err.message || "Unable to load your availability."))
      .finally(() => setLoading(false));
  }, []);

  function toggleDate(date) {
    if (selectedDates.includes(date)) {
      setSelectedDates((current) => current.filter((entry) => entry !== date));
      setSlotsByDate((current) => { const next = { ...current }; delete next[date]; return next; });
    } else {
      setSelectedDates((current) => [...current, date].sort());
      setSlotsByDate((current) => ({ ...current, [date]: current[date]?.length ? current[date] : [blankSlot()] }));
    }
  }

  function updateSlot(date, index, field, value) {
    setSlotsByDate((current) => ({ ...current, [date]: current[date].map((slot, slotIndex) => slotIndex === index ? { ...slot, [field]: value } : slot) }));
    setError("");
  }

  function validateSlots() {
    for (const date of selectedDates) {
      const ordered = [...(slotsByDate[date] || [])].sort((left, right) => left.from.localeCompare(right.from));
      if (!ordered.length || ordered.some((slot) => !slot.from || !slot.to || slot.to <= slot.from)) {
        setError(`End time must be later than start time for ${displayDate(date)}.`);
        return false;
      }
      if (ordered.some((slot, index) => index > 0 && slot.from < ordered[index - 1].to)) {
        setError(`Time slots cannot overlap for ${displayDate(date)}.`);
        return false;
      }
    }
    setError("");
    return true;
  }

  async function submit(event) {
    event.preventDefault();
    if (!details.fullName.trim() || String(details.phone).replace(/\D/g, "").length < 10) { setError("Enter your full name and a valid mobile number."); return; }
    setSaving(true);
    try {
      await saveVolunteerAvailability({ dates: Object.fromEntries(selectedDates.map((date) => [date, slotsByDate[date]])), full_name: details.fullName, phone: details.phone });
      setStep(6);
      setError("");
    } catch (err) { setError(err.message || "Unable to submit seva availability."); } finally { setSaving(false); }
  }

  const review = <div className="seva-review-list">{selectedDates.map((date) => <div className="seva-review-card" key={date}><strong>{displayDate(date, true)}</strong>{(slotsByDate[date] || []).map((slot, index) => <span key={`${date}-${index}`}>{formatTime12(slot.from)} – {formatTime12(slot.to)}</span>)}</div>)}</div>;
  const progressStep = Math.min(step, 3);

  return <div className="seva-wizard-shell"><div className="seva-wizard-frame"><img alt="" className="seva-wizard-bg" src={sevaLightBackground} /><div className="seva-wizard-content"><header><button aria-label="Back to main menu" className="seva-wizard-back" onClick={() => navigate(backTo)} type="button">&lt;</button><h1>Seva</h1><div className="gold-line" /></header><div aria-label="Progress" className="seva-progress">{[0, 1, 2, 3].map((dot) => <span className={dot === progressStep ? "active" : dot < progressStep ? "complete" : ""} key={dot} />)}</div>
    <main className="seva-flow-scroll">{loading ? <section className="seva-flow-card"><p>Loading your seva availability...</p></section> : null}
      {!loading && step === 0 ? <section className="seva-flow-card"><div className="seva-flow-heading"><h2>Available Dates</h2><p>Select one or more dates you are available for seva.</p></div><div className="seva-date-grid">{sevaDates.map((date) => { const selected = selectedDates.includes(date); return <button className={selected ? "selected" : ""} key={date} onClick={() => toggleDate(date)} type="button"><span>{new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short" })}</span><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</strong>{selected ? <em>Selected</em> : null}</button>; })}</div><button className="seva-main-button" disabled={!selectedDates.length} onClick={() => setStep(1)} type="button">Continue</button></section> : null}
      {!loading && step === 1 ? <section className="seva-flow-card"><button className="seva-inline-back" onClick={() => setStep(0)} type="button">&lt; Dates</button><div className="seva-flow-heading"><h2>Your Availability</h2><p>Set one or more time slots for each selected date.</p></div><div className="seva-time-days">{selectedDates.map((date) => <article key={date}><div className="seva-time-day-head"><div><span>Seva Date</span><strong>{displayDate(date, true)}</strong></div><button onClick={() => toggleDate(date)} type="button">Remove Date</button></div>{(slotsByDate[date] || []).map((slot, index) => <div className="seva-time-slot" key={`${date}-${index}`}><div><span>Time {index + 1}</span>{slotsByDate[date].length > 1 ? <button onClick={() => setSlotsByDate((current) => ({ ...current, [date]: current[date].filter((_, slotIndex) => slotIndex !== index) }))} type="button">Remove Time</button> : null}</div><label>From<input onChange={(event) => updateSlot(date, index, "from", event.target.value)} type="time" value={slot.from} /></label><label>To<input onChange={(event) => updateSlot(date, index, "to", event.target.value)} type="time" value={slot.to} /></label></div>)}<button className="seva-add-slot" onClick={() => setSlotsByDate((current) => ({ ...current, [date]: [...current[date], blankSlot()] }))} type="button">+ Add another time on this day</button></article>)}</div>{error ? <div className="seva-error">{error}</div> : null}<button className="seva-main-button" onClick={() => { if (validateSlots()) setStep(2); }} type="button">Continue</button></section> : null}
      {!loading && step === 2 ? <section className="seva-flow-card"><button className="seva-inline-back" onClick={() => setStep(1)} type="button">&lt; Timing</button><div className="seva-flow-heading"><h2>Confirm Your Seva</h2><p>Please review all selected dates and timings.</p></div>{review}<button className="seva-main-button" onClick={() => setStep(3)} type="button">Confirm Seva</button></section> : null}
      {!loading && step === 3 ? <section className="seva-flow-card seva-centered"><div className="seva-change-icon">?</div><div className="seva-flow-heading"><h2>Any Changes?</h2><p>Do you want to make any changes in your seva dates or timing?</p></div><button className="seva-main-button" onClick={() => setStep(4)} type="button">Yes, Make Changes</button><button className="seva-secondary-button" onClick={() => setStep(5)} type="button">No, Everything Is Correct</button></section> : null}
      {!loading && step === 4 ? <section className="seva-flow-card"><button className="seva-inline-back" onClick={() => setStep(2)} type="button">&lt; Review</button><div className="seva-flow-heading"><h2>What Would You Like to Change?</h2><p>Choose what you want to update.</p></div><button className="seva-choice-card" onClick={() => setStep(0)} type="button"><strong>Dates</strong><span>Add or remove seva dates</span></button><button className="seva-choice-card" onClick={() => setStep(1)} type="button"><strong>Timing</strong><span>Change time slots for selected dates</span></button></section> : null}
      {!loading && step === 5 ? <section className="seva-flow-card"><button className="seva-inline-back" onClick={() => setStep(2)} type="button">&lt; Review</button><div className="seva-flow-heading"><h2>Your Details</h2><p>Your seva is confirmed. Please verify your information.</p></div>{review}<form className="seva-details-form" onSubmit={submit}><label>Full Name<input autoComplete="name" onChange={(event) => setDetails({ ...details, fullName: event.target.value })} required value={details.fullName} /></label><label>Mobile Number<input autoComplete="tel" inputMode="tel" onChange={(event) => setDetails({ ...details, phone: event.target.value })} required value={details.phone} /></label>{error ? <div className="seva-error">{error}</div> : null}<button className="seva-main-button" disabled={saving} type="submit">{saving ? "Submitting..." : "Submit Seva"}</button></form></section> : null}
      {!loading && step === 6 ? <section className="seva-flow-card seva-centered seva-thanks"><div className="seva-check">✓</div><div className="seva-flow-heading"><h2>Thank You</h2><p>Your seva availability has been submitted.</p><strong>Jai Swaminarayan</strong></div><button className="seva-secondary-button" onClick={() => setStep(0)} type="button">Update My Response</button><button className="seva-main-button" onClick={() => navigate("/")} type="button">Main Menu</button></section> : null}
    </main></div></div></div>;
}

export function VolunteerAdminContent() {
  const [confirmations, setConfirmations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchVolunteerAdminAvailability()
      .then((data) => setConfirmations(data.records || []))
      .catch((err) => setError(err.message || "Unable to load volunteer confirmations."))
      .finally(() => setLoading(false));
  }, []);

  return <div className="volunteer-confirmations">
    {loading ? <div className="empty-state">Loading volunteer confirmations...</div> : null}
    {error ? <div className="admin-feedback error">{error}</div> : null}
    {!loading && !error && !confirmations.length ? <div className="empty-state">No volunteer confirmations have been submitted.</div> : null}
    {confirmations.map((confirmation) => {
      const dates = Object.entries(confirmation.dates || {});
      const legacyDates = dates.length ? [] : availabilityDays.flatMap((day) => confirmation.days?.[day]?.available ? [[day, [{ from: confirmation.days[day].from, to: confirmation.days[day].to }]]] : []);
      return <article className="list-panel volunteer-confirmation-card" key={confirmation.uid}>
        <header><div><strong>{confirmation.full_name || "Volunteer"}</strong><span>{confirmation.phone || "No phone number"}</span></div><span className="request-status approved">Confirmed</span></header>
        <div className="volunteer-confirmation-dates">{[...dates, ...legacyDates].map(([date, slots]) => <div key={date}><strong>{/^\d{4}-\d{2}-\d{2}$/.test(date) ? displayDate(date, true) : date[0].toUpperCase() + date.slice(1)}</strong><span>{slots.map((slot) => `${formatTime12(slot.from)} - ${formatTime12(slot.to)}`).join(", ")}</span></div>)}</div>
        {confirmation.updatedAt ? <footer>Submitted {new Date(confirmation.updatedAt).toLocaleString("en-CA")}</footer> : null}
      </article>;
    })}
  </div>;
}

export function VolunteerAdmin({ permission }) {
  if (!canVolunteerAdmin(permission)) return <Navigate replace to="/" />;
  return <VolunteerOnlyAdmin />;
}

function VolunteerOnlyAdmin() {
  const [tab, setTab] = useState("volunteer");
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { fetchAdminSuggestions().then((data) => setSuggestions(data.suggestions || [])).catch((err) => setError(err.message)); }, []);
  return <VolunteerShell backTo="/" title={tab === "volunteer" ? "Volunteer Confirmations" : "Suggestions"} wide><div className="admin-tabs"><button className={`filter-chip ${tab === "volunteer" ? "active" : ""}`} onClick={() => setTab("volunteer")} type="button">Volunteer Confirmations</button><button className={`filter-chip ${tab === "suggestions" ? "active" : ""}`} onClick={() => setTab("suggestions")} type="button">Suggestions</button></div>{error ? <div className="admin-feedback error">{error}</div> : null}{tab === "volunteer" ? <VolunteerAdminContent /> : <div className="admin-suggestion-list">{suggestions.length ? suggestions.map((suggestion) => <article className="list-panel admin-suggestion-card" key={suggestion.id}><header><strong>{suggestion.submittedBy || "User"}</strong><span>{suggestion.email || ""}</span></header><p>{suggestion.message}</p><footer>{suggestion.createdAt ? new Date(suggestion.createdAt).toLocaleString("en-CA") : ""}</footer></article>) : <div className="empty-state">No suggestions have been submitted.</div>}</div>}</VolunteerShell>;
}
