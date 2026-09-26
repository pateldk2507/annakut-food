import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-dt";
import JSZip from "jszip";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import "datatables.net-buttons-dt";
import "datatables.net-responsive-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";
import "datatables.net-buttons-dt/css/buttons.dataTables.css";
import "datatables.net-responsive-dt/css/responsive.dataTables.css";
import resetPasswordIcon from "./assets/reset-password.png";
import {
  getCart,
  getCartSessionId,
  getDetails,
  getSessionAuth,
  getSelectedCategoryId,
  getSelectedSubcategoryId,
  resetCartSessionId,
  resetFlow,
  setActiveOrderId,
  setCart,
  setDetails,
  setFlowMode,
  setSessionAuth,
  setSelectedCategoryId,
  setSelectedSubcategoryId,
} from "./lib/storage";
import { onAuthChanged, registerWithEmailPassword, sendFirebasePasswordReset, signInWithEmailPassword, signOutFirebaseUser } from "./lib/firebase";
import {
  addAdminMenuItem,
  addAdminMenuCategory,
  approveAdminItemRequest,
  deleteAdminUser,
  fetchBookedItems,
  fetchAdminAccounts,
  fetchAdminItemRequests,
  fetchAdminMe,
  fetchAdminOfferings,
  fetchAdminSettings,
  fetchProfile,
  fetchMenu,
  findOfferings,
  releaseCartHolds,
  requestItemReminder,
  removeAdminMenuItem,
  saveOffering,
  saveProfile,
  syncCartHolds,
  submitItemRequest,
  updateAdminMenuItem,
  updateAdminOffering,
  updateAdminOfferingStatus,
  updateAdminSettings,
  updateAdminUser,
  updateAdminUserPermission,
} from "./lib/api";

const backgrounds = {
  home: "/assets/bg_temple_2.jpg",
  rules: "/assets/bg_temple_1.jpg",
  category: "/assets/bg_temple_3.jpg",
  subcategory: "/assets/bg_temple_4.jpg",
  foodList: "/assets/food_1.jpg",
  cart: "/assets/food_2.jpg",
  details: "/assets/bg_temple_5.jpg",
  review: "/assets/bg_temple_1.jpg",
  confirmed: "/assets/bg_temple_2.jpg",
};

DataTable.use(DataTablesCore);
DataTablesCore.Buttons.jszip(JSZip);
pdfMake.addVirtualFileSystem(pdfFonts);
DataTablesCore.Buttons.pdfMake(pdfMake);

const rulesList = [
  { icon: "No", title: "No Onion / Garlic" },
  { icon: "Veg", title: "Pure Vegetarian" },
  { icon: "Sat", title: "No Meat / Eggs" },
  { icon: "Seva", title: "Prepared with Devotion" },
];

function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "");
}

function formatUsPhone(value = "") {
  const digits = normalizePhone(value).slice(-10);
  if (digits.length !== 10) {
    return value;
  }

  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function splitFullName(value = "") {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || parts[0],
  };
}

function isValidEmail(value = "") {
  return /\S+@\S+\.\S+/.test(value);
}

const GEOAPIFY_API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY;
const THUNDER_BAY_FILTER = "rect:-89.6900,48.2800,-88.9800,48.5600|countrycode:ca";

function isThunderBayResult(result) {
  const city = String(result?.city || "").trim().toLowerCase();
  const formatted = String(result?.formatted || "").trim().toLowerCase();
  return city === "thunder bay" || formatted.includes("thunder bay");
}

function parseThunderBayAddress(value = "") {
  const raw = String(value || "").trim();
  const withUnitMatch = raw.match(/^Unit\s+([^,]+),\s*(.+?),\s*Thunder Bay,\s*ON/i);
  if (withUnitMatch) {
    return {
      unitNumber: withUnitMatch[1].trim(),
      addressLine1: withUnitMatch[2].trim(),
    };
  }

  const noUnitMatch = raw.match(/^(.+?),\s*Thunder Bay,\s*ON/i);
  if (noUnitMatch) {
    return {
      unitNumber: "",
      addressLine1: noUnitMatch[1].trim(),
    };
  }

  return {
    unitNumber: "",
    addressLine1: raw,
  };
}

function getGeoapifyStreetLine(result) {
  const addressLine1 = String(result?.address_line1 || "").trim();
  if (addressLine1) {
    return addressLine1;
  }

  const street = [result?.housenumber, result?.street].filter(Boolean).join(" ").trim();
  if (street) {
    return street;
  }

  const formatted = String(result?.formatted || "").trim();
  if (!formatted) {
    return "";
  }

  const parsed = parseThunderBayAddress(formatted);
  return parsed.addressLine1 || formatted.split(",")[0]?.trim() || "";
}

function formatThunderBayAddress(addressLine1 = "", unitNumber = "") {
  const street = String(addressLine1 || "").trim();
  const unit = String(unitNumber || "").trim();
  if (!street) {
    return "Thunder Bay, ON";
  }
  const unitLabel = unit ? `Unit ${unit}, ` : "";
  return `${unitLabel}${street}, Thunder Bay, ON`;
}

function totalQty(cart) {
  return Object.keys(cart).length;
}

function titleizeTime(value) {
  return value ? new Date(value).toLocaleString() : "";
}

function tileCountLabel(count) {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function AppShell({ background, title, subtitle, children, fullBleed = false, wide = false, showCartShortcut = false, cartCount = 0, screenClassName = "", backTo = "", backLabel = "Back" }) {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <div className={`device-frame ${wide ? "device-frame-wide" : ""}`}>
        <div className={`screen ${fullBleed ? "screen-home" : "screen-paper"} ${screenClassName}`}>
          {fullBleed ? (
            <>
              <img alt="" className="screen-bg" src={background} />
              <div className="screen-overlay" />
            </>
          ) : null}
          <div className={`screen-content ${showCartShortcut ? "screen-content-actions" : ""}`}>
            <header className="screen-header">
              <div className="screen-header-row">
                <div className="screen-header-side screen-header-side-left">
                  {backTo ? <TopBackButton label={backLabel} to={backTo} /> : null}
                </div>
                <h1>{title}</h1>
                <div className="screen-header-side screen-header-side-right">
                  {showCartShortcut ? (
                    <div className="top-shortcuts">
                      <button className="top-shortcut" onClick={() => navigate("/profile")} type="button" aria-label="Profile">
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" />
                        </svg>
                      </button>
                      <button className="top-shortcut" onClick={() => navigate("/cart")} type="button" aria-label={`Cart with ${cartCount} items`}>
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 7H6M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                        </svg>
                        {cartCount > 0 ? <span className="cart-shortcut-badge">{cartCount}</span> : null}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="gold-line" />
              {subtitle ? <p className="screen-subtitle">{subtitle}</p> : null}
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ to, onClick, children, secondary = false, danger = false, type = "button", disabled = false }) {
  const className = ["action-button", secondary ? "secondary" : "", danger ? "danger" : "", disabled ? "disabled" : ""]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <a className={className} href={to} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <button className={className} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}

function TopBackButton({ to, label = "Back" }) {
  const navigate = useNavigate();
  return (
    <button aria-label={label} className="top-shortcut top-back-button" onClick={() => navigate(to)} type="button">
      <span aria-hidden="true">{"<"}</span>
    </button>
  );
}

function AddressAutocompleteField({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  selectedAddress,
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const requestIdRef = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowResults(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const query = String(value || "").trim();
    if (!GEOAPIFY_API_KEY || query.length < 3) {
      setResults([]);
      setLoading(false);
      setLookupError(query.length >= 3 && !GEOAPIFY_API_KEY ? "Missing Geoapify API key." : "");
      return undefined;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    setLoading(true);
    setLookupError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          text: query,
          filter: THUNDER_BAY_FILTER,
          format: "json",
          limit: "5",
          apiKey: GEOAPIFY_API_KEY,
        });

        const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Unable to load address suggestions.");
        }

        const data = await response.json();
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        const nextResults = Array.isArray(data.results) ? data.results.filter(isThunderBayResult) : [];
        setResults(nextResults);
        setShowResults(true);
      } catch (error) {
        if (requestIdRef.current === currentRequestId) {
          setLookupError(error.message || "Unable to load address suggestions.");
          setResults([]);
        }
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value]);

  return (
    <div className="autocomplete-field" ref={containerRef}>
      <label className="field-card compact">
        <span>{label}</span>
        <input
          className="field-input"
          onChange={(event) => {
            onChange(event.target.value);
            setShowResults(true);
          }}
          onFocus={() => {
            if (results.length) {
              setShowResults(true);
            }
          }}
          placeholder={placeholder}
          value={value}
        />
      </label>

      <div className="autocomplete-meta">
        <span>{selectedAddress ? "Thunder Bay address selected" : "Search is limited to Thunder Bay only"}</span>
        {loading ? <span>Searching...</span> : null}
      </div>

      {lookupError ? <div className="field-error show">{lookupError}</div> : null}

      {showResults && results.length ? (
        <div className="autocomplete-results">
          {results.map((result) => {
            const key = result.place_id || result.formatted;
            const addressLine1 = getGeoapifyStreetLine(result) || value;
            return (
              <button
                className="autocomplete-option"
                key={key}
                onClick={() => {
                  onChange(addressLine1);
                  onSelect(result);
                  setShowResults(false);
                }}
                type="button"
              >
                <strong>{addressLine1}</strong>
                <span>{result.address_line2 || "Thunder Bay, ON, Canada"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EmailPasswordAuthModal({ open, title, subtitle, onClose, onSuccess, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (open) {
      setMode(initialMode);
    } else {
      setPhone("");
      setFirstName("");
      setLastName("");
      setAddressLine1("");
      setSelectedAddress(null);
      setPassword("");
      setError("");
      setNotice("");
      setSubmitting(false);
    }
  }, [open, initialMode]);

  async function handleSubmit() {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);
    const normalizedFirstName = String(firstName || "").trim();
    const normalizedLastName = String(lastName || "").trim();
    const normalizedAddressLine1 = String(addressLine1 || "").trim();
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "signup" && normalizedPhone.length < 10) {
      setError("Enter a valid mobile number.");
      return;
    }
    if (mode === "signup" && !normalizedFirstName) {
      setError("Enter your first name.");
      return;
    }
    if (mode === "signup" && !normalizedLastName) {
      setError("Enter your last name.");
      return;
    }
    if (mode === "signup" && !normalizedAddressLine1) {
      setError("Enter your Thunder Bay home address.");
      return;
    }
    if (mode === "signup" && !selectedAddress) {
      setError("Select a Thunder Bay address from the suggestions.");
      return;
    }
    if (String(password || "").length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const user =
        mode === "signin"
          ? await signInWithEmailPassword(normalizedEmail, password)
          : await registerWithEmailPassword(normalizedEmail, password);

      let savedProfile = null;
      if (mode === "signup") {
        const profileResponse = await saveProfile({
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
          full_name: `${normalizedFirstName} ${normalizedLastName}`.trim(),
          phone: normalizedPhone,
          address: formatThunderBayAddress(normalizedAddressLine1),
          address_line1: normalizedAddressLine1,
          unit_number: "",
          email: user.email || normalizedEmail,
        });
        savedProfile = profileResponse.profile || null;
      }

      setSessionAuth({
        ...getSessionAuth(),
        uid: user.uid,
        email: user.email || normalizedEmail,
        phone: savedProfile?.phone || (mode === "signup" ? normalizedPhone : getSessionAuth().phone || ""),
        firstName: savedProfile?.first_name || (mode === "signup" ? normalizedFirstName : getSessionAuth().firstName || ""),
        lastName: savedProfile?.last_name || (mode === "signup" ? normalizedLastName : getSessionAuth().lastName || ""),
        fullName:
          savedProfile?.full_name || (mode === "signup" ? `${normalizedFirstName} ${normalizedLastName}`.trim() : getSessionAuth().fullName || ""),
        addressLine1: savedProfile?.address_line1 || (mode === "signup" ? normalizedAddressLine1 : getSessionAuth().addressLine1 || ""),
        unitNumber: savedProfile?.unit_number || getSessionAuth().unitNumber || "",
        address:
          savedProfile?.address ||
          (mode === "signup" ? formatThunderBayAddress(normalizedAddressLine1) : getSessionAuth().address || ""),
        startedAt: getSessionAuth().startedAt || new Date().toISOString(),
      });
      onSuccess();
    } catch (err) {
      const invalidLoginCodes = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"];
      if (mode === "signin" && invalidLoginCodes.includes(err.code)) {
        setError("Invalid email or password.");
      } else {
        setError(err.message || "Authentication failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter your email address first.");
      setNotice("");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await sendFirebasePasswordReset(normalizedEmail);
      setNotice(`Password reset instructions were sent to ${normalizedEmail}.`);
    } catch (err) {
      setError(err.message || "Unable to send the password reset email.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <strong>{title}</strong>
            <p>{subtitle}</p>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="modal-body">
          <label className="field-card compact">
            <span>Email Address</span>
            <input className="field-input" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" value={email} />
          </label>
          {mode === "signup" ? (
            <>
              <label className="field-card compact">
                <span>First Name</span>
                <input className="field-input" onChange={(event) => setFirstName(event.target.value)} placeholder="First name" value={firstName} />
              </label>
              <label className="field-card compact">
                <span>Last Name</span>
                <input className="field-input" onChange={(event) => setLastName(event.target.value)} placeholder="Last name" value={lastName} />
              </label>
              <label className="field-card compact">
                <span>Mobile Number</span>
                <input
                  className="field-input"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="10-digit mobile number"
                  value={phone}
                />
              </label>
              <AddressAutocompleteField
                label="Street Address"
                onChange={(nextValue) => {
                  setAddressLine1(nextValue);
                  setSelectedAddress(null);
                }}
                onSelect={(result) => {
                  setSelectedAddress(result);
                  setAddressLine1(getGeoapifyStreetLine(result));
                }}
                placeholder="Start typing your Thunder Bay address"
                selectedAddress={selectedAddress}
                value={addressLine1}
              />
              <label className="field-card compact">
                <span>City</span>
                <input className="field-input disabled-input" readOnly value="Thunder Bay, ON" />
              </label>
            </>
          ) : null}
          <label className="field-card compact">
            <span>Password</span>
            <input
              className="field-input"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              type="password"
              value={password}
            />
          </label>
          {error ? <div className="field-error show">{error}</div> : null}
          {notice ? <div className="auth-status">{notice}</div> : null}
          <div className="button-stack">
            <ActionButton disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </ActionButton>
            {mode === "signin" ? <button className="auth-reset-button" disabled={submitting} onClick={handlePasswordReset} type="button">Forgot password?</button> : null}
            <ActionButton
              onClick={() => {
                setMode((current) => (current === "signin" ? "signup" : "signin"));
                setError("");
                setNotice("");
              }}
              secondary
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePage({ firebaseUser, menu, cart, cartCount, setCartState, setDetailsState, availability }) {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [menuSearch, setMenuSearch] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [itemRequestOpen, setItemRequestOpen] = useState(false);
  const [requestedItemName, setRequestedItemName] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const searchableItems = (menu.categories || []).flatMap((category) =>
    (category.subcategories || []).flatMap((subcategory) =>
      (subcategory.items || []).map((item) => ({ ...item, category: category.name, subcategory: subcategory.name, category_id: category.id, subcategory_id: subcategory.id }))
    )
  );
  const normalizedSearch = menuSearch.trim().toLowerCase();
  const searchResults = normalizedSearch
    ? searchableItems.filter((item) => `${item.name} ${item.category} ${item.subcategory}`.toLowerCase().includes(normalizedSearch)).slice(0, 30)
    : [];

  useEffect(() => {
    const conflicts = availability.conflicts || [];
    if (conflicts.length) setSearchMessage(`${conflicts.map((item) => item.name).join(", ")} could not be added because another devotee selected it first.`);
  }, [availability.conflicts]);

  function resetLocalFlowState() {
    resetFlow();
    resetCartSessionId();
    setCartState({});
    setDetailsState({});
  }

  function addSearchItem(item) {
    if (cart[item.id] || availability.taken.has(item.id) || availability.held.has(item.id)) return;
    setCartState((current) => ({
      ...current,
      [item.id]: { ...item, item_id: item.id, qty: 1, subCategory: item.subcategory },
    }));
    setSearchMessage(`${item.name} added to your cart.`);
  }

  async function handleItemRequest(event) {
    event.preventDefault();
    setRequestSubmitting(true);
    setRequestError("");
    try {
      await submitItemRequest({ name: requestedItemName });
      setItemRequestOpen(false);
      setSearchMessage(`${requestedItemName.trim()} was sent to the admin for review.`);
      setRequestedItemName("");
    } catch (err) {
      setRequestError(err.message || "Unable to submit this item request.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <AppShell
      background={backgrounds.home}
      cartCount={cartCount}
      fullBleed={!firebaseUser}
      showCartShortcut={Boolean(firebaseUser)}
      title="Annakut"
      subtitle=""
    >
      {!firebaseUser ? <div className="home-brand" /> : null}

      {firebaseUser ? (
        <>
          <div className="menu-search-panel">
            <label className="menu-search-field">
              <span>Search offerings</span>
              <input className="admin-search" onChange={(event) => { setMenuSearch(event.target.value); setSearchMessage(""); }} placeholder="Search by item name" type="search" value={menuSearch} />
            </label>
            {searchMessage ? <div className="menu-search-message" role="status">{searchMessage}</div> : null}
            {normalizedSearch ? (
              <div className="menu-search-results">
                {searchResults.length ? searchResults.map((item) => {
                  const inCart = Boolean(cart[item.id]);
                  const taken = availability.taken.has(item.id);
                  const held = availability.held.has(item.id) && !inCart;
                  return (
                    <div className="menu-search-result" key={item.id}>
                      <div><strong>{item.name}</strong><span>{item.category} / {item.subcategory}</span></div>
                      <button className={`mini-button ${taken || held ? "muted" : ""}`} disabled={inCart || taken || held} onClick={() => addSearchItem(item)} type="button">{inCart ? "In Cart" : taken ? "Taken" : held ? "On Hold" : "Add"}</button>
                    </div>
                  );
                }) : <div className="empty-state request-item-empty"><strong>No matching items found.</strong><button className="mini-button" onClick={() => { setRequestedItemName(menuSearch.trim()); setRequestError(""); setItemRequestOpen(true); }} type="button">Request This Offering Item</button></div>}
              </div>
            ) : null}
          </div>
          <div className="tile-grid">
            {menu.categories.map((category) => (
              <button
                className="selection-tile"
                key={category.id}
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setSelectedSubcategoryId("");
                  navigate("/subcategory");
                }}
                type="button"
              >
                <div className="selection-icon">Menu</div>
                <strong>{category.name}</strong>
                <span>Tap to continue</span>
              </button>
            ))}
          </div>
          {itemRequestOpen ? (
            <div className="modal-backdrop" onClick={() => setItemRequestOpen(false)}>
              <form aria-labelledby="item-request-title" aria-modal="true" className="modal-card item-request-modal" onClick={(event) => event.stopPropagation()} onSubmit={handleItemRequest} role="dialog">
                <div className="modal-head"><div><strong id="item-request-title">Request Offering Item</strong><p>Enter the item you would like the BAPS Annakut team to review.</p></div><button aria-label="Close item request" className="modal-close" onClick={() => setItemRequestOpen(false)} type="button">x</button></div>
                <div className="modal-body"><label className="field-card"><span>Item Name</span><input autoFocus className="field-input" maxLength="100" minLength="2" onChange={(event) => setRequestedItemName(event.target.value)} required value={requestedItemName} /></label>{requestError ? <div className="field-error show">{requestError}</div> : null}</div>
                <div className="admin-modal-actions"><ActionButton disabled={requestSubmitting || requestedItemName.trim().length < 2} type="submit">{requestSubmitting ? "Submitting..." : "Submit Request"}</ActionButton></div>
              </form>
            </div>
          ) : null}
        </>
      ) : (
        <div className="home-actions">
        <ActionButton
          onClick={() => {
            setAuthMode("signin");
            setAuthOpen(true);
          }}
        >
          Login
        </ActionButton>
        <ActionButton
          onClick={() => {
            setAuthMode("signup");
            setAuthOpen(true);
          }}
          secondary
        >
          Sign Up
        </ActionButton>
        <div className="home-footnote">Offer with devotion • No onion/garlic • Pure veg</div>
        </div>
      )}

      <EmailPasswordAuthModal
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={async () => {
          setAuthOpen(false);
          resetLocalFlowState();
          setFlowMode("new");
          navigate("/");
        }}
        open={authOpen}
        subtitle={authMode === "signup" ? "Create your account to continue." : "Sign in with your account to continue."}
        title={authMode === "signup" ? "Create Account" : "Login"}
      />

    </AppShell>
  );
}

function RulesPage({ firebaseUser }) {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <AppShell background={backgrounds.rules} fullBleed title="Rules">
      <div className="tile-grid">
        {rulesList.map((rule) => (
          <div className="rule-tile" key={rule.title}>
            <div className="rule-icon">{rule.icon}</div>
            <strong>{rule.title}</strong>
          </div>
        ))}
      </div>
      <div className="footer-actions">
        <ActionButton
          onClick={() => {
            if (firebaseUser) {
              navigate("/category");
            } else {
              setAuthOpen(true);
            }
          }}
        >
          Begin Seva
        </ActionButton>
      </div>

      <EmailPasswordAuthModal
        initialMode="signin"
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          navigate("/category");
        }}
        open={authOpen}
        subtitle="Sign in or create an account with Firebase email/password to begin your seva session."
        title="Begin Your Session"
      />
    </AppShell>
  );
}

function CategoryPage({ firebaseUser, menu, cartCount }) {
  const navigate = useNavigate();
  if (!firebaseUser) {
    return <Navigate replace to="/rules" />;
  }

  return (
    <AppShell backLabel="Home" backTo="/" background={backgrounds.category} cartCount={cartCount} showCartShortcut title="Category" subtitle="Select a category">
      <div className="tile-grid">
        {menu.categories.map((category) => (
          <button
            className="selection-tile"
            key={category.id}
            onClick={() => {
              setSelectedCategoryId(category.id);
              setSelectedSubcategoryId("");
              navigate("/subcategory");
            }}
            type="button"
          >
            <div className="selection-icon">Menu</div>
            <strong>{category.name}</strong>
            <span>Tap to continue</span>
          </button>
        ))}
      </div>
    </AppShell>
  );
}

function SubcategoryPage({ firebaseUser, menu, cartCount }) {
  const navigate = useNavigate();
  const category = menu.categories.find((item) => item.id === getSelectedCategoryId());
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const filteredSubcategories = (category?.subcategories || []).filter((subcategory) => subcategory.name.toLowerCase().includes(subcategorySearch.trim().toLowerCase()));

  if (!firebaseUser) {
    return <Navigate replace to="/rules" />;
  }

  if (!category) {
    return <Navigate replace to="/category" />;
  }

  return (
    <AppShell backLabel="Home" backTo="/" background={backgrounds.subcategory} cartCount={cartCount} showCartShortcut title={category.name} subtitle="">
      <label className="menu-search-field subcategory-search">
        <span>Search subcategories</span>
        <input className="admin-search" onChange={(event) => setSubcategorySearch(event.target.value)} placeholder="Search subcategory name" type="search" value={subcategorySearch} />
      </label>
      <div className="tile-grid">
        {filteredSubcategories.map((subcategory) => (
          <button
            className="selection-tile"
            key={subcategory.id}
            onClick={() => {
              setSelectedSubcategoryId(subcategory.id);
              navigate("/food-list");
            }}
            type="button"
          >
            <div className="selection-icon">Dish</div>
            <strong>{subcategory.name}</strong>
            <span>{tileCountLabel(subcategory.items.length)}</span>
          </button>
        ))}
        {!filteredSubcategories.length ? <div className="empty-state"><strong>No matching subcategories</strong><p>Try another name.</p></div> : null}
      </div>
    </AppShell>
  );
}

function FoodListPage({ firebaseUser, menu, cart, setCartState, availability, refreshAvailability }) {
  const navigate = useNavigate();
  const category = menu.categories.find((item) => item.id === getSelectedCategoryId());
  const subcategory = category?.subcategories.find((item) => item.id === getSelectedSubcategoryId());
  const [reminderItemIds, setReminderItemIds] = useState(() => new Set());
  const [conflictItems, setConflictItems] = useState([]);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const normalizedItemSearch = itemSearch.trim().toLowerCase();
  const filteredItems = (subcategory?.items || []).filter((item) => item.name.toLowerCase().includes(normalizedItemSearch));

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshAvailability();
    }, 3000);

    function handleVisibility() {
      if (!document.hidden) {
        refreshAvailability();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshAvailability]);

  if (!firebaseUser) {
    return <Navigate replace to="/rules" />;
  }

  if (!subcategory) {
    return <Navigate replace to="/subcategory" />;
  }

  function addItem(item) {
    const nextCart = { ...cart };
    if (nextCart[item.id]) return;
    nextCart[item.id] = {
      id: item.id,
      item_id: item.id,
      name: item.name,
      qty: 1,
      category: category.name,
      subcategory: subcategory.name,
      subCategory: subcategory.name,
      category_id: category.id,
      subcategory_id: subcategory.id,
      name_of_vangi_maker: item.name_of_vangi_maker || "",
      area: item.area || "",
      contact_number: item.contact_number || "",
      address: item.address || "",
    };

    setCartState(nextCart);
    setConflictItems([]);
    setFeedbackMessage("");
  }

  async function handleReminder(item) {
    try {
      await requestItemReminder({
        item_id: item.id,
        item_name: item.name,
      });
      setReminderItemIds((current) => new Set([...current, item.id]));
    } catch {
      // Leave the button available if the reminder request fails.
    }
  }

  useEffect(() => {
    const conflicts = availability.conflicts || [];
    setConflictItems(conflicts);
    if (conflicts.length === 1) {
      setFeedbackMessage(`${conflicts[0].name} was claimed first by another devotee, so your click did not go through.`);
    } else if (conflicts.length > 1) {
      setFeedbackMessage("Some items were claimed first by another devotee, so your click did not go through.");
    }
  }, [availability.conflicts]);

  return (
    <AppShell backTo="/subcategory" background={backgrounds.foodList} cartCount={totalQty(cart)} showCartShortcut title={subcategory.name} subtitle={category.name}>
      {feedbackMessage ? (
        <div className="conflict-toast" role="status">
          <strong>Item not added</strong>
          <p>{feedbackMessage}</p>
        </div>
      ) : null}
      {conflictItems.length ? (
        <div className="conflict-banner">
          <strong>Conflict detected</strong>
          <p>These items were claimed first by another devotee and were removed from your cart.</p>
          <div className="conflict-list">
            {conflictItems.map((item) => (
              <div className="conflict-row" key={item.id || item.name}>
                <span>{item.name}</span>
                <button
                  className="mini-button reminder"
                  disabled={reminderItemIds.has(item.id)}
                  onClick={() => handleReminder(item)}
                  type="button"
                >
                  {reminderItemIds.has(item.id) ? "Reminder Set" : "Remind Me"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <label className="menu-search-field subcategory-search">
        <span>Search {subcategory.name}</span>
        <input className="admin-search" onChange={(event) => setItemSearch(event.target.value)} placeholder="Search item name" type="search" value={itemSearch} />
      </label>
      <div className="list-stack">
        {filteredItems.map((item) => {
          const inCart = Boolean(cart[item.id]);
          const isTaken = availability.taken.has(item.id) && !inCart;
          const isHeld = availability.held.has(item.id) && !inCart;

          return (
            <div className="item-card" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                {item.name_of_vangi_maker ? (
                  <p>
                    {item.name_of_vangi_maker}
                    {item.area ? ` • ${item.area}` : ""}
                  </p>
                ) : null}
                {item.contact_number || item.address ? (
                  <span>{[item.contact_number, item.address].filter(Boolean).join(" • ")}</span>
                ) : null}
              </div>

              {isTaken ? (
                <button className="mini-button muted" disabled type="button">
                  Taken
                </button>
              ) : isHeld ? (
                <div className="item-actions-stack">
                  <button className="mini-button muted" disabled type="button">
                    On Hold
                  </button>
                  <button
                    className="mini-button reminder"
                    disabled={reminderItemIds.has(item.id)}
                    onClick={() => handleReminder(item)}
                    type="button"
                  >
                    {reminderItemIds.has(item.id) ? "Reminder Set" : "Remind Me"}
                  </button>
                </div>
              ) : !inCart ? (
                <button className="mini-button" onClick={() => addItem(item)} type="button">
                  Add
                </button>
              ) : (
                <button className="mini-button muted" disabled type="button">In Cart</button>
              )}
            </div>
          );
        })}
        {!filteredItems.length ? <div className="empty-state"><strong>No matching items</strong><p>Try another item name.</p></div> : null}
      </div>
      <div className="footer-actions">
        <ActionButton onClick={() => navigate("/cart")}>Go to Cart ({totalQty(cart)})</ActionButton>
        <ActionButton onClick={() => navigate("/subcategory")} secondary>
          Back
        </ActionButton>
      </div>
    </AppShell>
  );
}

function CartPage({ firebaseUser, cart, setCartState, availability }) {
  const navigate = useNavigate();
  const items = Object.values(cart);

  if (!firebaseUser) {
    return <Navigate replace to="/rules" />;
  }

  function removeItem(itemId) {
    const nextCart = { ...cart };
    delete nextCart[itemId];
    setCartState(nextCart);
  }

  return (
    <AppShell backTo="/" background={backgrounds.cart} title="Cart" subtitle="Review selected items">
      {availability.conflicts?.length ? (
        <div className="conflict-banner">
          <strong>Conflict detected</strong>
          <p>Some items were claimed first by another devotee and were removed from your cart.</p>
        </div>
      ) : null}

      <div className="list-panel">
        <div className="list-panel-heading">
          <strong>Your Items</strong>
          <button
            className="mini-button danger"
            disabled={!items.length}
            onClick={() => {
              if (window.confirm("Clear all items from your cart?")) {
                setCartState({});
              }
            }}
            type="button"
          >
            Clear Cart
          </button>
        </div>
        <div className="list-stack compact">
          {items.length ? (
            items.map((item) => (
              <div className="cart-row" key={item.id}>
                <div className="cart-item-name">
                  <strong>{item.name}</strong>
                  <p>
                    {item.category}
                    {item.subcategory ? ` • ${item.subcategory}` : ""}
                  </p>
                </div>
                <div className="cart-actions">
                  <button className="mini-button danger" onClick={() => removeItem(item.id)} type="button">
                    X
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>Your cart is empty</strong>
              <p>Add items from the food list to continue.</p>
            </div>
          )}
        </div>

        <div className="summary-row">
          <span>Total items</span>
          <strong>{totalQty(cart)}</strong>
        </div>
      </div>

      <div className="footer-actions">
        <ActionButton disabled={!items.length} onClick={() => navigate("/details")}>
          Continue
        </ActionButton>
        <ActionButton onClick={() => navigate("/")} secondary>
          Back to Home
        </ActionButton>
      </div>
    </AppShell>
  );
}

function ProfilePage({ firebaseUser, cartCount, setCartState, setDetailsState }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    addressLine1: "",
    unitNumber: "",
    address: "",
    notes: "",
  });
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [offerings, setOfferings] = useState([]);
  const [selectedOffering, setSelectedOffering] = useState(null);
  const [permission, setPermission] = useState("user");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    let cancelled = false;

    async function loadProfileData() {
      setLoading(true);
      setError("");
      try {
        const [profileData, offeringData] = await Promise.all([fetchProfile(), findOfferings()]);
        if (cancelled) {
          return;
        }

        const profile = profileData.profile || {};
        const parsedAddress = parseThunderBayAddress(profile.address || "");
        const addressLine1 = profile.address_line1 || parsedAddress.addressLine1 || "";
        const unitNumber = profile.unit_number || parsedAddress.unitNumber || "";
        setForm({
          fullName: profile.full_name || "",
          phone: profile.phone || "",
          email: profile.email || firebaseUser.email || "",
          addressLine1,
          unitNumber,
          address: profile.address || formatThunderBayAddress(addressLine1, unitNumber),
          notes: profile.notes || "",
        });
        setPermission(profile.permission || "user");
        setSelectedAddress(addressLine1 ? { address_line1: addressLine1, city: "Thunder Bay" } : null);
        setOfferings(offeringData.offerings || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfileData();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return undefined;

    let active = true;
    async function refreshPermission() {
      try {
        const data = await fetchProfile();
        if (active) setPermission(data.profile?.permission || "user");
      } catch {
        // Keep background role refresh quiet; the main profile load handles errors.
      }
    }

    const intervalId = window.setInterval(refreshPermission, 30000);
    window.addEventListener("focus", refreshPermission);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshPermission);
    };
  }, [firebaseUser]);

  if (!firebaseUser) {
    return <Navigate replace to="/" />;
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setMessage("");
  }

  async function handleSave(event) {
    event.preventDefault();
    const { firstName, lastName } = splitFullName(form.fullName);
    const address = formatThunderBayAddress(form.addressLine1, form.unitNumber);

    if (!form.fullName.trim() || normalizePhone(form.phone).length < 10 || !form.addressLine1.trim() || !form.unitNumber.trim()) {
      setError("Please complete your name, phone, and Thunder Bay address.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveProfile({
        first_name: firstName,
        last_name: lastName,
        full_name: form.fullName.trim(),
        phone: form.phone,
        email: form.email || firebaseUser.email,
        address,
        address_line1: form.addressLine1,
        unit_number: form.unitNumber,
        notes: form.notes,
      });
      setForm((current) => ({ ...current, address }));
      setIsEditingAddress(false);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    try {
      try {
        await releaseCartHolds({ session_id: getCartSessionId() });
      } catch {
        // Signing out should still continue if releasing an expired hold fails.
      }
      resetFlow();
      resetCartSessionId();
      setCartState({});
      setDetailsState({});
      await signOutFirebaseUser();
      navigate("/");
    } catch (err) {
      setError(err.message || "Unable to log out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <AppShell backTo="/" background={backgrounds.details} cartCount={cartCount} screenClassName="screen-profile" showCartShortcut title="Profile" subtitle="Personal information and offerings">
      {loading ? (
        <div className="confirm-card">
          <strong>Loading profile...</strong>
        </div>
      ) : null}

      <form className="form-stack" onSubmit={handleSave}>
        <label className="field-card">
          <span>Full Name</span>
          <input className="field-input" onChange={(event) => setField("fullName", event.target.value)} value={form.fullName} />
        </label>
        <label className="field-card">
          <span>Email</span>
          <input className="field-input disabled-input" readOnly value={form.email || firebaseUser.email || ""} />
        </label>
        <label className="field-card">
          <span>Phone</span>
          <input className="field-input" onChange={(event) => setField("phone", event.target.value)} value={form.phone} />
        </label>
        {isEditingAddress ? (
          <div className="address-editor">
            <AddressAutocompleteField
              label="Home Address"
              onChange={(nextValue) => {
                setField("addressLine1", nextValue);
                setSelectedAddress(null);
              }}
              onSelect={(result) => {
                setSelectedAddress(result);
                setField("addressLine1", getGeoapifyStreetLine(result));
              }}
              placeholder="Start typing your Thunder Bay address"
              selectedAddress={selectedAddress}
              value={form.addressLine1}
            />
            <label className="field-card">
              <span>Unit Number</span>
              <input className="field-input" onChange={(event) => setField("unitNumber", event.target.value)} value={form.unitNumber} />
            </label>
            <button className="mini-button" onClick={() => setIsEditingAddress(false)} type="button">
              Cancel Address Edit
            </button>
          </div>
        ) : (
          <div className="field-card saved-address-card">
            <span>Home Address</span>
            <strong>{formatThunderBayAddress(form.addressLine1, form.unitNumber)}</strong>
            <button className="mini-button" onClick={() => setIsEditingAddress(true)} type="button">
              Edit Address
            </button>
          </div>
        )}
        {message ? <div className="auth-status">{message}</div> : null}
        {error ? <div className="auth-status error">{error}</div> : null}
        <ActionButton disabled={saving} type="submit">
          {saving ? "Saving..." : "Save Profile"}
        </ActionButton>
      </form>

      <div className="list-panel">
        <strong>Submitted Offerings</strong>
        <p className="offering-change-note">To change or cancel a submitted offering, please call Rakeshbhai or Sagarbhai.</p>
        <div className="list-stack compact">
          {offerings.length ? (
            offerings.map((offering) => (
                <div className="profile-offering" key={offering.id}>
                  <button className="cart-row profile-offering-button" onClick={() => setSelectedOffering(offering)} type="button">
                    <div>
                      <strong>{offering.receipt_no || `Offering #${offering.id}`}</strong>
                      <p>{offering.items_count} items - {offering.status || "submitted"}</p>
                      <span>{offering.created_at}</span>
                    </div>
                    <span className="offering-status">{offering.status || "submitted"}</span>
                  </button>
                </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No offerings yet</strong>
              <p>Your submitted offerings will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {selectedOffering ? (
        <div className="modal-backdrop" onClick={() => setSelectedOffering(null)}>
          <div aria-labelledby="offering-details-title" aria-modal="true" className="modal-card profile-offering-modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="modal-head">
              <div>
                <strong id="offering-details-title">{selectedOffering.receipt_no || `Offering #${selectedOffering.id}`}</strong>
                <p>{selectedOffering.created_at} - {selectedOffering.status || "submitted"}</p>
              </div>
              <button aria-label="Close order details" className="modal-close" onClick={() => setSelectedOffering(null)} type="button">x</button>
            </div>
            <div className="modal-body profile-offering-modal-items">
              <strong>Offering Items</strong>
              {(selectedOffering.items || []).length ? selectedOffering.items.map((item, index) => (
                <div className="profile-offering-modal-item" key={item.id || `${item.name}-${index}`}>
                  <span>{item.name}</span>
                </div>
              )) : <div className="empty-state">Item details are unavailable. Restart the Node server to load the updated order data.</div>}
            </div>
          </div>
        </div>
      ) : null}

      <div className="footer-actions">
        {["super_admin", "admin", "orders_status"].includes(permission) ? (
          <ActionButton onClick={() => navigate("/admin")}>
            Admin Panel
          </ActionButton>
        ) : null}
        <ActionButton secondary disabled={loggingOut} onClick={handleLogout}>
          {loggingOut ? "Logging Out..." : "Log Out"}
        </ActionButton>
      </div>
    </AppShell>
  );
}

function MenuItemActions({ item, onEdit, onRemove }) {
  return (
    <div className="admin-inline-actions">
      <button aria-label={`Edit ${item.name}`} className="admin-icon-button" onClick={() => onEdit(item)} title="Edit item" type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m4 16-.8 4.8L8 20l10.7-10.7a2.1 2.1 0 0 0-3-3L4.9 17.1M14.5 7.5l3 3" />
        </svg>
      </button>
      <button aria-label={`Remove ${item.name}`} className="admin-icon-button danger" onClick={() => onRemove(item)} title="Remove item" type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

function AdminMobileCards({ activeTab, accounts, offerings, menuItems, permissionOptions, statusOptions, savingId, onCancelOrder, onDeleteUser, onEdit, onPermissionChange, onRemoveItem, onResetPassword, onStatusChange }) {
  const [query, setQuery] = useState("");
  const source = activeTab === "users" ? accounts : activeTab === "items" ? menuItems : offerings;
  const normalizedQuery = query.trim().toLowerCase();
  const records = source.filter((record) => !normalizedQuery || JSON.stringify(record).toLowerCase().includes(normalizedQuery));

  return (
    <div className="admin-mobile-list">
      <label className="admin-mobile-search">
        <span>Search</span>
        <input className="admin-search" onChange={(event) => setQuery(event.target.value)} placeholder="Name, mobile, address, or item" type="search" value={query} />
      </label>
      {records.length ? records.map((record, recordIndex) => {
        if (activeTab === "users") {
          return (
            <article className="admin-mobile-card" key={record.uid}>
              <div className="admin-card-heading-row">
                <strong>{record.full_name || "User"}</strong>
                <div className="admin-inline-actions admin-user-actions">
                  <button aria-label={`Reset password for ${record.full_name || "user"}`} className="admin-icon-button" disabled={savingId === record.uid} onClick={() => onResetPassword(record)} title="Reset password" type="button"><img alt="" aria-hidden="true" src={resetPasswordIcon} /></button>
                  <button aria-label={`Edit ${record.full_name || "user"}`} className="admin-icon-button" onClick={() => onEdit("user", record)} title="Edit user" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 16-.8 4.8L8 20l10.7-10.7a2.1 2.1 0 0 0-3-3L4.9 17.1M14.5 7.5l3 3" /></svg></button>
                  <button aria-label={`Delete ${record.full_name || "user"}`} className="admin-icon-button danger" disabled={savingId === record.uid} onClick={() => onDeleteUser(record)} title="Delete user" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg></button>
                </div>
              </div>
              <div className="admin-card-contact"><span>{record.email || "-"}</span><span>{formatUsPhone(record.phone || "") || "-"}</span></div>
              <div className="admin-card-control-row">
                <label><span className="sr-only">Permission</span><select aria-label={`Permission for ${record.full_name || "user"}`} className="admin-select" disabled={savingId === record.uid} onChange={(event) => onPermissionChange(record.uid, event.target.value)} value={record.permission || "user"}>{permissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>
            </article>
          );
        }
        if (activeTab === "items") {
          return (
            <article className="admin-mobile-card" key={`${record.categoryId || "category"}-${record.subcategoryId || "subcategory"}-${record.id || "item"}-${recordIndex}`}>
              <div className="admin-card-heading-row">
                <strong>{record.name}</strong>
                <MenuItemActions item={record} onEdit={(item) => onEdit("item", item)} onRemove={onRemoveItem} />
              </div>
            </article>
          );
        }
        return (
          <article className="admin-mobile-card" key={record.id}>
            <div className="admin-order-heading">
              <strong>{record.devotee?.full_name || "Devotee"} <span>({formatUsPhone(record.devotee?.phone || "") || "-"})</span></strong>
              <span>{record.receipt_no || record.id}</span>
            </div>
            <div className="admin-order-date">{record.created_at || "-"}</div>
            <div className="admin-order-items"><b>Items ({(record.items || []).length})</b><span className="admin-card-items">{(record.items || []).map((item, index) => <i key={item.id || `${item.name}-${index}`}>{item.name}</i>)}</span></div>
            <div className="admin-inline-actions"><button className="mini-button" onClick={() => onEdit("order", record)} type="button">Edit</button><button className="mini-button danger" disabled={savingId === record.id || record.status === "cancelled"} onClick={() => onCancelOrder(record)} type="button">{record.status === "cancelled" ? "Cancelled" : "Cancel"}</button></div>
          </article>
        );
      }) : <div className="empty-state">No matching records.</div>}
    </div>
  );
}

function RequestedItemCard({ itemRequest, menu, onApprove, saving }) {
  const [categoryId, setCategoryId] = useState(itemRequest.categoryId || "");
  const [subcategoryId, setSubcategoryId] = useState(itemRequest.subcategoryId || "");
  const category = (menu.categories || []).find((entry) => entry.id === categoryId);
  const isPending = itemRequest.status === "pending";

  return (
    <article className="admin-mobile-card requested-item-card">
      <div className="admin-card-heading-row"><strong>{itemRequest.name}</strong><span className={`request-status ${isPending ? "pending" : "approved"}`}>{itemRequest.status || "pending"}</span></div>
      <div className="requested-item-meta"><span>{itemRequest.requestedBy || "Devotee"}</span><span>{itemRequest.requesterEmail || "-"}</span><span>{itemRequest.createdAt ? new Date(itemRequest.createdAt).toLocaleString("en-CA") : "-"}</span></div>
      {isPending ? (
        <div className="requested-item-approval">
          <select aria-label={`Category for ${itemRequest.name}`} className="admin-select" onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(""); }} value={categoryId}><option value="">Select category</option>{(menu.categories || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
          <select aria-label={`Subcategory for ${itemRequest.name}`} className="admin-select" disabled={!categoryId} onChange={(event) => setSubcategoryId(event.target.value)} value={subcategoryId}><option value="">Select subcategory</option>{(category?.subcategories || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
          <button className="mini-button" disabled={saving || !categoryId || !subcategoryId} onClick={() => onApprove(itemRequest, categoryId, subcategoryId)} type="button">{saving ? "Approving..." : "Approve & Add"}</button>
        </div>
      ) : <div className="requested-item-approved">Added to the menu</div>}
    </article>
  );
}

function AdminItemRequests({ itemRequests, menu, onApprove, savingId }) {
  return (
    <div className="list-panel requested-items-panel">
      <strong>Requested Offering Items</strong>
      <div className="requested-items-list">
        {itemRequests.length ? itemRequests.map((itemRequest) => <RequestedItemCard itemRequest={itemRequest} key={itemRequest.id} menu={menu} onApprove={onApprove} saving={savingId === itemRequest.id} />) : <div className="empty-state">No offering items have been requested.</div>}
      </div>
    </div>
  );
}

function AdminReports({ menuItems, offerings }) {
  const [reportType, setReportType] = useState("taken");
  const activeOfferings = offerings.filter((offering) => offering.status !== "cancelled");
  const takenRows = activeOfferings.flatMap((offering) => (offering.items || []).map((item) => ({
    item: item.name,
    category: item.category || "Uncategorized",
    user: offering.devotee?.full_name || "Devotee",
    phone: formatUsPhone(offering.devotee?.phone || "") || "-",
    receipt: offering.receipt_no || offering.id,
  })));
  const takenIds = new Set(activeOfferings.flatMap((offering) => (offering.items || []).map((item) => item.item_id || item.id)));
  const nonTakenRows = menuItems.filter((item) => !takenIds.has(item.id)).map((item) => ({ item: item.name, category: item.category, subcategory: item.subcategory }));
  const categoryRows = Object.values(takenRows.reduce((groups, row) => {
    const key = row.category || "Uncategorized";
    groups[key] ||= { category: key, count: 0, items: [] };
    groups[key].count += 1;
    groups[key].items.push(row.item);
    return groups;
  }, {}));
  const userRows = activeOfferings.map((offering) => ({
    user: offering.devotee?.full_name || "Devotee",
    phone: formatUsPhone(offering.devotee?.phone || "") || "-",
    receipt: offering.receipt_no || offering.id,
    count: (offering.items || []).length,
    items: (offering.items || []).map((item) => item.name),
  }));
  const reports = {
    taken: { title: "All Taken Items", rows: takenRows },
    available: { title: "All Non-Taken Items", rows: nonTakenRows },
    category: { title: "Items Taken by Category", rows: categoryRows },
    user: { title: "Items Taken by User", rows: userRows },
  };
  const report = reports[reportType];
  const nonTakenPercentage = menuItems.length ? Math.round((nonTakenRows.length / menuItems.length) * 100) : 0;
  const columns = report.rows.length ? Object.keys(report.rows[0]) : [];
  const columnTitle = (column) => column.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const exportRows = report.rows.map((row) => Object.fromEntries(columns.map((column) => [
    column,
    Array.isArray(row[column]) ? row[column].join(", ") : row[column] ?? "-",
  ])));
  const reportTableOptions = {
    responsive: true,
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    order: [],
    autoWidth: false,
    layout: {
      topStart: ["pageLength", {
        buttons: [
          {
            extend: "pdfHtml5",
            text: "PDF",
            className: "report-buttons-pdf",
            title: `Annakut ${report.title} Report`,
            filename: `annakut-${reportType}-report`,
            orientation: "landscape",
            pageSize: "A4",
            exportOptions: { columns: columns.map((_column, index) => index) },
            customize: (document) => {
              document.defaultStyle.fontSize = 8;
              document.styles.title = { color: "#3d1d13", bold: true, fontSize: 16, margin: [0, 0, 0, 10] };
              document.styles.tableHeader = { color: "#fffaf1", fillColor: "#6e2116", bold: true, fontSize: 9 };
              const table = document.content.find((section) => section.table);
              if (table) {
                table.layout = {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => "#cbb59a",
                  vLineColor: () => "#cbb59a",
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                };
              }
            },
          },
          {
            extend: "excelHtml5",
            text: "Excel",
            className: "report-buttons-excel",
            title: `Annakut ${report.title} Report`,
            filename: `annakut-${reportType}-report`,
            exportOptions: { columns: columns.map((_column, index) => index) },
          },
        ],
      }],
      topEnd: "search",
      bottomStart: "info",
      bottomEnd: "paging",
    },
    language: {
      search: "Search:",
      searchPlaceholder: "Search this report",
      emptyTable: "No records available",
    },
  };

  return (
    <div className="admin-reports">
      <div className="report-list">
        {Object.entries(reports).map(([key, entry]) => (
          <button className={`report-choice ${reportType === key ? "active" : ""}`} key={key} onClick={() => setReportType(key)} type="button">
            <strong>{entry.title}</strong>
            {key === "available" ? (
              <span className="report-progress-summary">
                <span>{entry.rows.length} of {menuItems.length} remaining ({nonTakenPercentage}%)</span>
                <span aria-hidden="true" className="report-progress-track"><span className="report-progress-value" style={{ width: `${nonTakenPercentage}%` }} /></span>
              </span>
            ) : <span>{entry.rows.length} records</span>}
          </button>
        ))}
      </div>
      <div className="list-panel report-output">
        <strong>{report.title}</strong>
        {report.rows.length ? <>
          <div className="admin-mobile-export-actions report-mobile-export-actions">
            <button className="mini-button" onClick={() => document.querySelector(".report-desktop-table .report-buttons-pdf")?.click()} type="button">Export PDF</button>
            <button className="mini-button" onClick={() => document.querySelector(".report-desktop-table .report-buttons-excel")?.click()} type="button">Export Excel</button>
          </div>
          <div className="report-mobile-cards">{exportRows.map((row, index) => <article className="admin-mobile-card" key={`${reportType}-${index}`}>{columns.map((column) => <span key={column}><b>{columnTitle(column)}</b>{row[column]}</span>)}</article>)}</div>
          <div className="report-desktop-table admin-table-wrap">
            <DataTable
              className="display nowrap admin-data-table"
              columns={columns.map((column) => ({ data: column, title: columnTitle(column) }))}
              data={exportRows}
              key={reportType}
              options={reportTableOptions}
            />
          </div>
        </> : <div className="empty-state">No records available for this report.</div>}
      </div>
    </div>
  );
}

function AdminDataTable({ activeTab, accounts, offerings, menuItems, permissionOptions, statusOptions, savingId, onCancelOrder, onDeleteUser, onEdit, onPermissionChange, onRemoveItem, onResetPassword, onStatusChange }) {
  const reportName = activeTab === "users" ? "Users" : activeTab === "items" ? "Menu Items" : "Orders";
  const exportColumns = activeTab === "users" ? [0, 1, 2, 3, 4] : activeTab === "items" ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6];
  const exportOptions = {
    columns: exportColumns,
    format: {
      body: (_data, row, column) => {
        if (activeTab === "users") {
          const account = accounts[row] || {};
          return [account.full_name, account.email, formatUsPhone(account.phone || ""), account.permission, account.address][column] || "-";
        }

        if (activeTab === "items") {
          const item = menuItems[row] || {};
          return [item.name, item.category, item.subcategory][column] || "-";
        }

        const offering = offerings[row] || {};
        const devotee = offering.devotee || {};
        const values = [
          offering.receipt_no || offering.id,
          [devotee.full_name, formatUsPhone(devotee.phone || ""), devotee.email].filter(Boolean).join(" | "),
          (offering.items || []).map((item) => item.name).join(", "),
          offering.containers_required || 0,
          devotee.address,
          String(offering.status || "submitted").replace("_", " "),
          offering.created_at,
        ];
        return values[column] ?? "-";
      },
    },
  };
  const options = {
    responsive: true,
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    order: [],
    autoWidth: false,
    layout: {
      topStart: ["pageLength", {
        buttons: [
          {
            extend: "pdfHtml5",
            text: "PDF",
            className: "buttons-pdf",
            title: `Annakut ${reportName} Report`,
            filename: `annakut-${activeTab}`,
            orientation: "landscape",
            pageSize: "A4",
            exportOptions,
            customize: (document) => {
              document.defaultStyle.fontSize = 7;
              document.styles.title = { color: "#3d1d13", bold: true, fontSize: 16, margin: [0, 0, 0, 10] };
              document.styles.tableHeader = { color: "#fffaf1", fillColor: "#6e2116", bold: true, fontSize: 8 };
              const table = document.content.find((section) => section.table);
              if (table) {
                table.layout = {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => "#cbb59a",
                  vLineColor: () => "#cbb59a",
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                };
              }
            },
          },
          {
            extend: "excelHtml5",
            text: "Excel",
            className: "buttons-excel",
            title: `Annakut ${reportName} Report`,
            filename: `annakut-${activeTab}`,
            exportOptions,
          },
        ],
      }],
      topEnd: "search",
      bottomStart: "info",
      bottomEnd: "paging",
    },
    language: {
      search: "Search:",
      searchPlaceholder: "Name, mobile, address, or item",
      emptyTable: "No records available",
    },
  };

  if (activeTab === "users") {
    return (
      <DataTable
        className="display nowrap admin-data-table"
        columns={[
          { data: "full_name", title: "Name" },
          { data: "email", title: "Email" },
          { data: "phone", title: "Phone" },
          { data: "permission", title: "Permission" },
          { data: "address", title: "Address" },
          { data: null, title: "Action", orderable: false, searchable: false },
        ]}
        data={accounts}
        options={options}
        slots={{
          2: (phone) => formatUsPhone(phone || "") || "-",
          3: (permission, account) => (
            <select className="admin-select" disabled={savingId === account.uid} onChange={(event) => onPermissionChange(account.uid, event.target.value)} value={permission || "user"}>
              {permissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ),
          5: (_data, account) => <div className="admin-inline-actions"><button className="mini-button" onClick={() => onEdit("user", account)} type="button">Edit</button><button className="mini-button" disabled={savingId === account.uid} onClick={() => onResetPassword(account)} type="button">Reset Password</button><button className="mini-button danger" disabled={savingId === account.uid} onClick={() => onDeleteUser(account)} type="button">Delete</button></div>,
        }}
      />
    );
  }

  if (activeTab === "items") {
    return (
      <DataTable
        className="display nowrap admin-data-table"
        columns={[
          { data: "name", title: "Item" },
          { data: "category", title: "Category" },
          { data: "subcategory", title: "Subcategory" },
          { data: null, title: "Actions", orderable: false, searchable: false },
        ]}
        data={menuItems}
        options={options}
        slots={{
          3: (_data, item) => <MenuItemActions item={item} onEdit={(selectedItem) => onEdit("item", selectedItem)} onRemove={onRemoveItem} />,
        }}
      />
    );
  }

  return (
    <DataTable
      className="display nowrap admin-data-table"
      columns={[
        { data: "receipt_no", title: "Receipt" },
        { data: "devotee.full_name", title: "User" },
        { data: "items", title: "Items" },
        { data: "containers_required", title: "Containers" },
        { data: "devotee.address", title: "Address" },
        { data: "status", title: "Status" },
        { data: "created_at", title: "Submitted" },
        { data: null, title: "Action", orderable: false, searchable: false },
      ]}
      data={offerings}
      options={options}
      slots={{
        0: (receipt, offering) => receipt || offering.id,
        1: (_name, offering) => (
          <div className="admin-user-cell">
            <strong>{offering.devotee?.full_name || "Devotee"}</strong>
            <span>{formatUsPhone(offering.devotee?.phone || "") || "-"}</span>
            <span>{offering.devotee?.email || "-"}</span>
          </div>
        ),
        2: (items) => (
          <div className="admin-items-cell">
            {(items || []).length ? items.map((item, index) => <span key={item.id || `${item.name}-${index}`}>{item.name}</span>) : <span>-</span>}
          </div>
        ),
        5: (status, offering) => (
          <select className="admin-select" disabled={savingId === offering.id} onChange={(event) => onStatusChange(offering.id, event.target.value)} value={status || "submitted"}>
            {statusOptions.map((option) => <option key={option} value={option}>{option.replace("_", " ")}</option>)}
          </select>
        ),
        7: (_data, offering) => activeTab === "orders" ? (
          <div className="admin-inline-actions">
            <button className="mini-button" onClick={() => onEdit("order", offering)} type="button">Edit</button>
            <button className="mini-button danger" disabled={savingId === offering.id || offering.status === "cancelled"} onClick={() => onCancelOrder(offering)} type="button">
              {offering.status === "cancelled" ? "Cancelled" : "Cancel"}
            </button>
          </div>
        ) : "-",
      }}
    />
  );
}

function AdminPage({ firebaseUser, menu, setMenu }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [itemRequests, setItemRequests] = useState([]);
  const [adminPermission, setAdminPermission] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [editor, setEditor] = useState(null);
  const [newItem, setNewItem] = useState({ categoryId: "", subcategoryId: "", name: "" });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [receiptFooterMessage, setReceiptFooterMessage] = useState("Please keep this email as your receipt. To change or cancel a submitted offering, please call Rakeshbhai or Sagarbhai.");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messageVersion, setMessageVersion] = useState(0);
  const isFullAdmin = ["super_admin", "admin"].includes(adminPermission);
  const isSuperAdmin = adminPermission === "super_admin";
  const statusOptions = ["submitted", "confirmed", "preparing", "ready", "picked_up", "cancelled"];
  const permissionOptions = [
    { value: "user", label: "Normal User" },
    { value: "orders_status", label: "Orders Status" },
    { value: "admin", label: "Admin" },
  ];
  const menuItems = (menu.categories || []).flatMap((category) =>
    (category.subcategories || []).flatMap((subcategory) =>
      (subcategory.items || []).map((item) => ({ ...item, categoryId: category.id, category: category.name, subcategoryId: subcategory.id, subcategory: subcategory.name }))
    )
  );

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    async function loadAdminData() {
      setLoading(true);
      setError("");
      try {
        const meData = await fetchAdminMe();
        const nextPermission = meData.permission || "";
        const [accountData, offeringData, settingsData, requestData] = await Promise.all([
          ["super_admin", "admin"].includes(nextPermission) ? fetchAdminAccounts() : Promise.resolve({ accounts: [] }),
          fetchAdminOfferings(),
          nextPermission === "super_admin" ? fetchAdminSettings() : Promise.resolve(null),
          ["super_admin", "admin"].includes(nextPermission) ? fetchAdminItemRequests() : Promise.resolve({ requests: [] }),
        ]);
        if (cancelled) return;
        setAdminPermission(nextPermission);
        setAccounts(accountData.accounts || []);
        setOfferings(offeringData.offerings || []);
        setItemRequests(requestData.requests || []);
        if (settingsData?.receipt_footer_message) setReceiptFooterMessage(settingsData.receipt_footer_message);
        setActiveTab(["super_admin", "admin"].includes(nextPermission) ? "users" : "orders");
      } catch (err) {
        if (!cancelled) setError(err.message || "Unable to load admin data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAdminData();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!message) return undefined;
    const timerId = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timerId);
  }, [message, messageVersion]);

  if (!firebaseUser) return <Navigate replace to="/" />;

  function showResult(text) {
    setMessage(text);
    setMessageVersion((current) => current + 1);
    setError("");
  }

  function confirmAdminPromotion(uid, permission) {
    const account = accounts.find((entry) => entry.uid === uid);
    if (account?.permission !== "user" || permission !== "admin") return true;
    const label = account.full_name || account.email || "this user";
    return window.confirm(`Give ${label} full Admin access? They will be able to manage users, orders, menu items, and reports.`);
  }

  async function handlePermissionChange(uid, permission, { confirmed = false, quiet = false } = {}) {
    if (!confirmed && !confirmAdminPromotion(uid, permission)) {
      setAccounts((current) => [...current]);
      return false;
    }
    setSavingId(uid);
    try {
      const data = await updateAdminUserPermission(uid, permission);
      setAccounts((current) => current.map((account) => (account.uid === uid ? { ...account, permission: data.permission } : account)));
      if (!quiet) showResult("User permission updated.");
      return true;
    } catch (err) {
      setError(err.message || "Unable to update permission.");
      return false;
    } finally {
      setSavingId("");
    }
  }

  async function handleAdminPasswordReset(account) {
    if (!account.email) {
      setError("This user does not have an email address.");
      return;
    }
    if (!window.confirm(`Send password reset instructions to ${account.email}?`)) return;

    setSavingId(account.uid);
    try {
      await sendFirebasePasswordReset(account.email);
      showResult(`Password reset instructions were sent to ${account.email}.`);
    } catch (err) {
      setError(err.message || "Unable to send the password reset email.");
    } finally {
      setSavingId("");
    }
  }

  async function handleDeleteUser(account) {
    const label = account.full_name || account.email || "this user";
    if (!window.confirm(`Permanently delete ${label}? Their login, profile, and offering will be removed, and their items will become available.`)) return;
    setSavingId(account.uid);
    try {
      await deleteAdminUser(account.uid);
      setAccounts((current) => current.filter((entry) => entry.uid !== account.uid));
      setOfferings((current) => current.filter((offering) => offering.uid !== account.uid));
      showResult(`${label} was permanently deleted.`);
    } catch (err) {
      setError(err.message || "Unable to delete user.");
    } finally {
      setSavingId("");
    }
  }

  async function handleStatusChange(offeringId, status) {
    setSavingId(offeringId);
    try {
      const data = await updateAdminOfferingStatus(offeringId, status);
      setOfferings((current) => current.map((offering) => (offering.id === offeringId ? { ...offering, status: data.status } : offering)));
      showResult("Order status updated.");
    } catch (err) {
      setError(err.message || "Unable to update order status.");
    } finally {
      setSavingId("");
    }
  }

  async function saveEditor() {
    const isPromotingToAdmin = editor.type === "user" && !confirmAdminPromotion(editor.data.uid, editor.data.permission);
    if (isPromotingToAdmin) return;
    setSavingId(editor.data.uid || editor.data.id);
    try {
      if (editor.type === "user") {
        const response = await updateAdminUser(editor.data.uid, editor.data);
        const permissionUpdated = await handlePermissionChange(editor.data.uid, editor.data.permission, { confirmed: true, quiet: true });
        if (!permissionUpdated) throw new Error("Unable to update permission.");
        setAccounts((current) => current.map((account) => (account.uid === editor.data.uid ? { ...account, ...response.user, permission: editor.data.permission } : account)));
        showResult("User updated.");
      } else if (editor.type === "order") {
        const response = await updateAdminOffering(editor.data.id, { items: editor.data.items });
        setOfferings((current) => current.map((offering) => (offering.id === editor.data.id ? response.offering : offering)));
        showResult("Order updated.");
      } else if (editor.type === "item") {
        const response = await updateAdminMenuItem(editor.data.id, { name: editor.data.name });
        setMenu(response.menu);
        showResult("Menu item updated in Firebase.");
      }
      setEditor(null);
    } catch (err) {
      setError(err.message || "Unable to save changes.");
    } finally {
      setSavingId("");
    }
  }

  async function handleAddItem() {
    setSavingId("new-item");
    try {
      const response = await addAdminMenuItem({ category_id: newItem.categoryId, subcategory_id: newItem.subcategoryId, name: newItem.name });
      setMenu(response.menu);
      setNewItem({ categoryId: "", subcategoryId: "", name: "" });
      showResult("Menu item added to Firebase.");
    } catch (err) {
      setError(err.message || "Unable to add menu item.");
    } finally {
      setSavingId("");
    }
  }

  async function handleAddCategory() {
    setSavingId("new-category");
    try {
      const response = await addAdminMenuCategory({ name: newCategoryName });
      setMenu(response.menu);
      setNewCategoryName("");
      showResult("Menu category added to Firebase.");
    } catch (err) {
      setError(err.message || "Unable to add category.");
    } finally {
      setSavingId("");
    }
  }

  async function handleApproveItemRequest(itemRequest, categoryId, subcategoryId) {
    if (!window.confirm(`Approve ${itemRequest.name} and add it to the selected menu section?`)) return;
    setSavingId(itemRequest.id);
    try {
      const response = await approveAdminItemRequest(itemRequest.id, { category_id: categoryId, subcategory_id: subcategoryId });
      setMenu(response.menu);
      setItemRequests((current) => current.map((entry) => (entry.id === itemRequest.id ? response.request : entry)));
      showResult(`${itemRequest.name} was approved and added to the menu.`);
    } catch (err) {
      setError(err.message || "Unable to approve this requested item.");
    } finally {
      setSavingId("");
    }
  }

  async function handleOpenItemRequests() {
    setActiveTab("requests");
    try {
      const response = await fetchAdminItemRequests();
      setItemRequests(response.requests || []);
    } catch (err) {
      setError(err.message || "Unable to load requested items.");
    }
  }

  async function handleRemoveItem(item) {
    if (!window.confirm(`Remove ${item.name} from the menu?`)) return;
    setSavingId(item.id);
    try {
      const response = await removeAdminMenuItem(item.id);
      setMenu(response.menu);
      showResult("Menu item removed from Firebase.");
    } catch (err) {
      setError(err.message || "Unable to remove menu item.");
    } finally {
      setSavingId("");
    }
  }

  async function handleCancelOrder(offering) {
    const devoteeName = offering.devotee?.full_name || "this devotee";
    if (!window.confirm(`Cancel ${devoteeName}'s order? Its items will become available again.`)) return;
    setSavingId(offering.id);
    try {
      const data = await updateAdminOfferingStatus(offering.id, "cancelled");
      setOfferings((current) => current.map((entry) => (entry.id === offering.id ? { ...entry, status: data.status } : entry)));
      if (editor?.type === "order" && editor.data.id === offering.id) setEditor(null);
      showResult(`${devoteeName}'s order was cancelled.`);
    } catch (err) {
      setError(err.message || "Unable to cancel order.");
    } finally {
      setSavingId("");
    }
  }

  async function handleSaveSettings() {
    setSavingId("settings");
    try {
      const response = await updateAdminSettings({ receipt_footer_message: receiptFooterMessage });
      setReceiptFooterMessage(response.receipt_footer_message);
      showResult("Confirmation email footer updated.");
    } catch (err) {
      setError(err.message || "Unable to update the footer message.");
    } finally {
      setSavingId("");
    }
  }

  const activeCategories = menu.categories || [];
  const selectedCategory = activeCategories.find((category) => category.id === newItem.categoryId);
  const adminPageTitle = {
    users: "Users",
    orders: "Orders",
    items: "Menu Items",
    requests: "Requested Items",
    reports: "Reports",
    settings: "Settings",
  }[activeTab] || "Admin";

  return (
    <AppShell backTo="/profile" background={backgrounds.details} title={adminPageTitle} wide>
      {loading ? <div className="confirm-card"><strong>Loading admin panel...</strong></div> : null}
      {message ? <div className="admin-feedback" role="status">{message}</div> : null}
      {error ? <div className="admin-feedback error" role="alert">{error}</div> : null}

      <div className="admin-tabs">
        {isFullAdmin ? <button className={`filter-chip ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")} type="button">Users</button> : null}
        <button className={`filter-chip ${activeTab === "orders" ? "active" : ""}`} onClick={() => setActiveTab("orders")} type="button">Orders</button>
        {isFullAdmin ? <button className={`filter-chip ${activeTab === "items" ? "active" : ""}`} onClick={() => setActiveTab("items")} type="button">Menu Items</button> : null}
        {isFullAdmin ? <button className={`filter-chip ${activeTab === "requests" ? "active" : ""}`} onClick={handleOpenItemRequests} type="button">Requested Items</button> : null}
        {isFullAdmin ? <button className={`filter-chip ${activeTab === "reports" ? "active" : ""}`} onClick={() => setActiveTab("reports")} type="button">Reports</button> : null}
        {isSuperAdmin ? <button className={`filter-chip ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")} type="button">Settings</button> : null}
      </div>

      {activeTab === "items" && isFullAdmin ? (
        <>
        <div className="list-panel admin-add-category">
          <strong>Add Category</strong>
          <input className="admin-search" onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category name" value={newCategoryName} />
          <button className="mini-button" disabled={savingId === "new-category" || !newCategoryName.trim()} onClick={handleAddCategory} type="button">{savingId === "new-category" ? "Adding..." : "Add Category"}</button>
        </div>
        <div className="list-panel admin-add-item">
          <strong>Add Menu Item</strong>
          <select className="admin-select" onChange={(event) => setNewItem({ categoryId: event.target.value, subcategoryId: "", name: newItem.name })} value={newItem.categoryId}><option value="">Select category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <select className="admin-select" disabled={!selectedCategory} onChange={(event) => setNewItem({ ...newItem, subcategoryId: event.target.value })} value={newItem.subcategoryId}><option value="">Select subcategory</option>{(selectedCategory?.subcategories || []).map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select>
          <input className="admin-search" onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} placeholder="New item name" value={newItem.name} />
          <button className="mini-button" disabled={savingId === "new-item"} onClick={handleAddItem} type="button">Add Item</button>
        </div>
        </>
      ) : null}

      {activeTab === "settings" && isSuperAdmin ? (
        <div className="list-panel admin-settings-panel">
          <strong>Confirmation Email Footer</strong>
          <p>This message appears at the bottom of every new confirmation email.</p>
          <label className="field-card">
            <span>Footer Message</span>
            <textarea className="field-input textarea" maxLength="500" onChange={(event) => setReceiptFooterMessage(event.target.value)} rows="5" value={receiptFooterMessage} />
          </label>
          <span className="admin-character-count">{receiptFooterMessage.length}/500</span>
          <button className="mini-button" disabled={savingId === "settings" || !receiptFooterMessage.trim()} onClick={handleSaveSettings} type="button">{savingId === "settings" ? "Saving..." : "Save Footer Message"}</button>
        </div>
      ) : null}

      {activeTab === "reports" && isFullAdmin ? <AdminReports menuItems={menuItems} offerings={offerings} /> : null}

      {activeTab === "requests" && isFullAdmin ? <AdminItemRequests itemRequests={itemRequests} menu={menu} onApprove={handleApproveItemRequest} savingId={savingId} /> : null}

      {!['settings', 'reports', 'requests'].includes(activeTab) ? <div className="list-panel admin-table-panel">
        <strong>{activeTab === "users" ? "Registered Users" : activeTab === "items" ? "Firebase Menu Items" : "Orders"}</strong>
        <div className="admin-mobile-export-actions">
          <button className="mini-button" onClick={() => document.querySelector(".admin-desktop-table .buttons-pdf")?.click()} type="button">Export PDF</button>
          <button className="mini-button" onClick={() => document.querySelector(".admin-desktop-table .buttons-excel")?.click()} type="button">Export Excel</button>
        </div>
        <AdminMobileCards
          accounts={accounts}
          activeTab={activeTab}
          menuItems={menuItems}
          offerings={offerings}
          onCancelOrder={handleCancelOrder}
          onDeleteUser={handleDeleteUser}
          onEdit={(type, data) => setEditor({ type, data: structuredClone(data) })}
          onPermissionChange={handlePermissionChange}
          onRemoveItem={handleRemoveItem}
          onResetPassword={handleAdminPasswordReset}
          onStatusChange={handleStatusChange}
          permissionOptions={permissionOptions}
          savingId={savingId}
          statusOptions={statusOptions}
        />
        <div className="admin-table-wrap admin-desktop-table">
          <AdminDataTable
            accounts={accounts}
            activeTab={activeTab}
            key={activeTab}
            menuItems={menuItems}
            offerings={offerings}
            onCancelOrder={handleCancelOrder}
            onDeleteUser={handleDeleteUser}
            onEdit={(type, data) => setEditor({ type, data: structuredClone(data) })}
            onPermissionChange={handlePermissionChange}
            onRemoveItem={handleRemoveItem}
            onResetPassword={handleAdminPasswordReset}
            onStatusChange={handleStatusChange}
            permissionOptions={permissionOptions}
            savingId={savingId}
            statusOptions={statusOptions}
          />
        </div>
      </div> : null}

      {editor ? (
        <div className="modal-backdrop" onClick={() => setEditor(null)}>
          <form className="modal-card admin-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); saveEditor(); }}>
            <div className="modal-head"><div><strong>{editor.type === "order" ? editor.data.devotee?.full_name || "Devotee" : `Edit ${editor.type}`}</strong><p>{editor.type === "order" ? "Modify this offering's items." : "Changes are saved directly to Firebase."}</p></div><button className="modal-close" onClick={() => setEditor(null)} type="button">x</button></div>
            <div className="modal-body">
              {editor.type === "user" ? <><label className="field-card"><span>Full Name</span><input className="field-input" onChange={(event) => setEditor({ ...editor, data: { ...editor.data, full_name: event.target.value } })} value={editor.data.full_name || ""} /></label><label className="field-card"><span>Email</span><input className="field-input" onChange={(event) => setEditor({ ...editor, data: { ...editor.data, email: event.target.value } })} type="email" value={editor.data.email || ""} /></label><label className="field-card"><span>Phone</span><input className="field-input" onChange={(event) => setEditor({ ...editor, data: { ...editor.data, phone: event.target.value } })} value={editor.data.phone || ""} /></label><label className="field-card"><span>Address</span><textarea className="field-input textarea" onChange={(event) => setEditor({ ...editor, data: { ...editor.data, address: event.target.value } })} value={editor.data.address || ""} /></label><label className="field-card"><span>Permission</span><select className="admin-select" onChange={(event) => setEditor({ ...editor, data: { ...editor.data, permission: event.target.value } })} value={editor.data.permission || "user"}>{permissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></> : null}
              {editor.type === "item" ? <label className="field-card"><span>Item Name</span><input className="field-input" onChange={(event) => setEditor({ ...editor, data: { ...editor.data, name: event.target.value } })} value={editor.data.name || ""} /></label> : null}
              {editor.type === "order" ? (
                <>
                  <strong>Offering Items</strong>
                  {(editor.data.items || []).map((item, index) => (
                    <div className="admin-edit-item" key={`${item.id || item.item_id}-${index}`}>
                      <span>{item.name}</span>
                      <button aria-label={`Remove ${item.name}`} className="admin-icon-button danger" onClick={() => { if (window.confirm(`Remove ${item.name} from this order?`)) setEditor({ ...editor, data: { ...editor.data, items: editor.data.items.filter((_, itemIndex) => itemIndex !== index) } }); }} title="Remove item" type="button">
                        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </div>
                  ))}
                  <label className="field-card">
                    <span>Add Item</span>
                    <select className="admin-select" onChange={(event) => { const item = menuItems.find((entry) => entry.id === event.target.value); if (item && !editor.data.items.some((entry) => (entry.id || entry.item_id) === item.id)) setEditor({ ...editor, data: { ...editor.data, items: [...editor.data.items, { ...item, item_id: item.id, qty: 1 }] } }); event.target.value = ""; }} defaultValue="">
                      <option value="">Select an item...</option>
                      {menuItems.filter((item) => !editor.data.items.some((entry) => (entry.id || entry.item_id) === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            <div className="admin-modal-actions">
              <ActionButton disabled={Boolean(savingId) || (editor.type === "order" && !editor.data.items.length)} type="submit">{savingId ? "Saving..." : "Save Changes"}</ActionButton>
              {editor.type === "order" && editor.data.status !== "cancelled" ? <button className="mini-button danger" disabled={Boolean(savingId)} onClick={() => handleCancelOrder(editor.data)} type="button">Cancel Order</button> : null}
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function DetailsPage({ firebaseUser, cart, setDetailsState, detailsState }) {
  const navigate = useNavigate();
  const items = Object.values(cart);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editAddress, setEditAddress] = useState(false);
  const sessionAuth = getSessionAuth();
  const verifiedEmail = firebaseUser?.email || sessionAuth.email || "";
  const initialAddressParts = parseThunderBayAddress(detailsState.address || sessionAuth.address || "");
  const [form, setForm] = useState({
    fullName: detailsState.fullName || sessionAuth.fullName || [sessionAuth.firstName, sessionAuth.lastName].filter(Boolean).join(" "),
    phone: detailsState.phone || sessionAuth.phone || "",
    email: detailsState.email || verifiedEmail,
    addressLine1: detailsState.addressLine1 || sessionAuth.addressLine1 || initialAddressParts.addressLine1 || "",
    unitNumber: detailsState.unitNumber || sessionAuth.unitNumber || initialAddressParts.unitNumber || "",
    notes: detailsState.notes || sessionAuth.notes || "",
  });
  const [selectedAddress, setSelectedAddress] = useState(
    initialAddressParts.addressLine1 ? { address_line1: initialAddressParts.addressLine1, city: "Thunder Bay" } : null
  );
  const [savedProfileAddress, setSavedProfileAddress] = useState(detailsState.address || sessionAuth.address || "");
  const formattedAddress = formatThunderBayAddress(form.addressLine1, form.unitNumber);
  const pickupAddressDisplay = savedProfileAddress || formattedAddress;

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    let cancelled = false;

    async function hydrateProfile() {
      try {
        const data = await fetchProfile();
        if (cancelled) {
          return;
        }

        const profile = data.profile;
        if (profile) {
          const nextAddressLine1 = profile.address_line1 || parseThunderBayAddress(profile.address || "").addressLine1 || "";
          const nextUnitNumber = profile.unit_number || parseThunderBayAddress(profile.address || "").unitNumber || "";

          setForm((current) => ({
            ...current,
            fullName: profile.full_name || current.fullName || "",
            phone: profile.phone || current.phone || "",
            email: verifiedEmail,
            addressLine1: nextAddressLine1 || current.addressLine1 || "",
            unitNumber: nextUnitNumber || current.unitNumber || "",
            notes: profile.notes || current.notes || "",
          }));

          setSavedProfileAddress(profile.address || formatThunderBayAddress(nextAddressLine1, nextUnitNumber));

          if (nextAddressLine1) {
            setSelectedAddress({ address_line1: nextAddressLine1, city: "Thunder Bay" });
          }

          setSessionAuth({
            ...getSessionAuth(),
            uid: firebaseUser.uid,
            email: profile.email || verifiedEmail,
            firstName: profile.first_name || "",
            lastName: profile.last_name || "",
            fullName: profile.full_name || "",
            phone: profile.phone || "",
            address: profile.address || "",
            addressLine1: profile.address_line1 || "",
            unitNumber: profile.unit_number || "",
            notes: profile.notes || "",
            startedAt: getSessionAuth().startedAt || new Date().toISOString(),
          });
        }
      } catch {
        // Keep locally cached values if no saved profile is found yet.
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    hydrateProfile();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, verifiedEmail]);

  if (!firebaseUser) {
    return <Navigate replace to="/rules" />;
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function validate() {
    if (!form.fullName.trim() || normalizePhone(form.phone).length < 10) {
      setError("Please complete your full name and phone number.");
      return false;
    }
    if (!form.addressLine1.trim() || !form.unitNumber.trim()) {
      setError("Your Thunder Bay address is required.");
      return false;
    }
    if (!selectedAddress || !isThunderBayResult(selectedAddress)) {
      setError("Select a valid Thunder Bay address from the suggestions.");
      return false;
    }
    if (!verifiedEmail) {
      setError("Your Firebase email session is missing.");
      return false;
    }
    if (!items.length) {
      setError("Your cart is empty.");
      return false;
    }
    setError("");
    return true;
  }

  async function persistProfile() {
    const { firstName, lastName } = splitFullName(form.fullName);
    const response = await saveProfile({
      first_name: firstName,
      last_name: lastName,
      full_name: form.fullName.trim(),
      phone: form.phone,
      email: verifiedEmail,
      address: formattedAddress,
      address_line1: form.addressLine1,
      unit_number: form.unitNumber,
      notes: form.notes,
    });

      const profile = response.profile || {};
      const nextSavedAddress = profile.address || formattedAddress;
      setSessionAuth({
        ...getSessionAuth(),
        uid: firebaseUser.uid,
        email: profile.email || verifiedEmail,
      firstName: profile.first_name || firstName,
      lastName: profile.last_name || lastName,
      fullName: profile.full_name || form.fullName.trim(),
      phone: profile.phone || normalizePhone(form.phone),
        address: nextSavedAddress,
        addressLine1: profile.address_line1 || form.addressLine1,
        unitNumber: profile.unit_number || form.unitNumber,
        notes: profile.notes || form.notes,
        startedAt: getSessionAuth().startedAt || new Date().toISOString(),
      });
      setSavedProfileAddress(nextSavedAddress);

      return profile;
  }

  async function handleReview(event) {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const profile = await persistProfile();
      setDetailsState({
        ...form,
        email: verifiedEmail,
        address: profile.address || formattedAddress,
        addressLine1: profile.address_line1 || form.addressLine1,
        unitNumber: profile.unit_number || form.unitNumber,
      });
      setEditAddress(false);
      navigate("/review");
    } catch (err) {
      setError(err.message || "Unable to load your saved details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell background={backgrounds.details} cartCount={totalQty(cart)} showCartShortcut title="Details" subtitle="Confirm your devotee information before review">
      {profileLoading ? (
        <div className="confirm-card">
          <strong>Loading your saved details...</strong>
          <p>Please wait while we fetch your profile from the database.</p>
        </div>
      ) : null}

      <form className="form-stack" onSubmit={handleReview}>
        <label className="field-card">
          <span>Full Name *</span>
          <input className="field-input" onChange={(event) => setField("fullName", event.target.value)} value={form.fullName} />
        </label>
        <label className="field-card">
          <span>Verified Email</span>
          <input className="field-input disabled-input" readOnly value={verifiedEmail} />
        </label>
        <label className="field-card">
          <span>Phone *</span>
          <input className="field-input" onChange={(event) => setField("phone", event.target.value)} value={form.phone} />
        </label>

        <div className="field-card">
          <span>Pickup Address</span>
          <div className="profile-summary-card">
            <strong>{pickupAddressDisplay || "No address saved yet"}</strong>
            <p>Your saved Thunder Bay address will be used for this seva.</p>
            {!editAddress ? (
              <ActionButton onClick={() => setEditAddress(true)} secondary>
                Edit Address
              </ActionButton>
            ) : null}
          </div>
        </div>

        {editAddress ? (
          <>
            <AddressAutocompleteField
              label="Edit Street Address *"
              onChange={(nextValue) => {
                setField("addressLine1", nextValue);
                setSelectedAddress(null);
              }}
              onSelect={(result) => {
                setSelectedAddress(result);
                setField("addressLine1", getGeoapifyStreetLine(result));
              }}
              placeholder="Start typing your Thunder Bay address"
              selectedAddress={selectedAddress}
              value={form.addressLine1}
            />
            <label className="field-card">
              <span>Unit Number *</span>
              <input className="field-input" onChange={(event) => setField("unitNumber", event.target.value)} value={form.unitNumber} />
            </label>
          </>
        ) : null}

        <label className="field-card">
          <span>Notes</span>
          <textarea className="field-input textarea" onChange={(event) => setField("notes", event.target.value)} value={form.notes} />
        </label>

        <div className="list-panel cart-review-panel">
          <strong>Items in Your Cart</strong>
          <div className="review-items">
            {items.map((item) => (
              <div className="review-item-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.category}
                    {item.subcategory ? ` - ${item.subcategory}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error ? <div className="field-error show">{error}</div> : null}
        <div className="footer-actions">
          <ActionButton disabled={saving || profileLoading} type="submit">
            {saving ? "Preparing Review..." : "Review"}
          </ActionButton>
          <ActionButton onClick={() => navigate("/cart")} secondary>
            Back to Cart
          </ActionButton>
        </div>
      </form>
    </AppShell>
  );
}

function ReviewPage({ firebaseUser, cart, detailsState, setCartState, setDetailsState }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const items = Object.values(cart);
  const sessionAuth = getSessionAuth();
  const verifiedEmail = firebaseUser?.email || detailsState.email || sessionAuth.email || "";
  const address = detailsState.address || sessionAuth.address || "Thunder Bay, ON";

  if (!firebaseUser) {
    return <Navigate replace to="/rules" />;
  }

  if (!items.length) {
    return <Navigate replace to="/cart" />;
  }

  if (!detailsState.fullName || !detailsState.phone) {
    return <Navigate replace to="/details" />;
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");

    try {
      const { firstName, lastName } = splitFullName(detailsState.fullName);
      const response = await saveOffering({
        mode: "new",
        offering_id: null,
        session_id: getCartSessionId(),
        full_name: detailsState.fullName.trim(),
        first_name: firstName,
        last_name: lastName,
        phone: detailsState.phone,
        email: verifiedEmail,
        address,
        address_line1: detailsState.addressLine1 || parseThunderBayAddress(address).addressLine1 || "",
        unit_number: detailsState.unitNumber || parseThunderBayAddress(address).unitNumber || "",
        notes: detailsState.notes || "",
        items: items.map((item) => ({
          id: item.id,
          item_id: item.item_id || item.id,
          name: item.name,
          qty: 1,
          category: item.category,
          subcategory: item.subcategory || item.subCategory,
          category_id: item.category_id,
          subcategory_id: item.subcategory_id,
        })),
      });

      setDetailsState({
        ...detailsState,
        email: verifiedEmail,
        address,
        receiptNo: response.receipt_no || "",
        emailSent: Boolean(response.email_sent),
        emailError: response.email_error || "",
        submittedAt: new Date().toISOString(),
        submittedItems: items.map((item) => ({ ...item, qty: 1 })),
      });
      setActiveOrderId(response.offering_id);
      setCartState({});
      navigate("/confirmed");
    } catch (err) {
      setError(err.message || "Unable to submit your offering.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell background={backgrounds.review} cartCount={totalQty(cart)} showCartShortcut title="Summary" subtitle="Review everything before final submission">
      <div className="receipt-card premium-receipt">
        <div className="receipt-header">
          <div>
            <strong>Offering Review</strong>
            <p>Please verify the your details and selected items.</p>
          </div>
          {/* <div className="receipt-status">Review</div> */}
        </div>

        <div className="receipt-grid-personal">
          <div className="receipt-panel">
            <h2 style={{ margin: 0, textAlign: 'center', fontWeight: 'bold' }}>{detailsState.fullName}</h2>
            <p> <b>Phone : </b>{formatUsPhone(detailsState.phone)}</p>
            <p><b>Email : </b>{verifiedEmail}</p>
          </div>
          <div className="receipt-panel">
            <span>Pickup Address</span>
            <p className="receipt-address">{address}</p>
          </div>
        </div>

        <div className="receipt-panel">
          <span>Items Added</span>
          <div className="receipt-items">
            {items.map((item) => (
              <div className="receipt-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.category}
                    {item.subcategory ? ` - ${item.subcategory}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="summary-row receipt-total">
            <span>Total items</span>
            <strong>{totalQty(cart)}</strong>
          </div>
        </div>

        {detailsState.notes ? (
          <div className="receipt-panel">
            <span>Notes</span>
            <p className="receipt-address">{detailsState.notes}</p>
          </div>
        ) : null}
      </div>

      {error ? <div className="field-error show">{error}</div> : null}

      <div className="footer-actions">
        <ActionButton disabled={saving} onClick={handleSubmit}>
          {saving ? "Submitting..." : "Submit"}
        </ActionButton>
        <ActionButton onClick={() => navigate("/details")} secondary>
          Back to Details
        </ActionButton>
      </div>
    </AppShell>
  );
}

function ConfirmedPage({ cart, detailsState, setCartState, setDetailsState }) {
  const navigate = useNavigate();
  const items = detailsState.submittedItems || Object.values(cart);
  const submittedAt = detailsState.submittedAt || new Date().toISOString();

  async function finishSession() {
    try {
      await releaseCartHolds({ session_id: getCartSessionId() });
    } catch {
      // Ignore release failures on exit.
    }
    resetFlow();
    resetCartSessionId();
    setCartState({});
    setDetailsState({});
    await signOutFirebaseUser();
    navigate("/");
  }

  return (
    <AppShell background={backgrounds.confirmed} title="Thank You">
      <div className="confirm-card success-hero">
        <div className="confirm-badge">Confirmed</div>
        <strong>Submission Confirmed</strong>
        <p>Your offering has been recorded and the selected items are now taken.</p>
        <div className="hero-meta">
          <span>{detailsState.emailSent ? "Confirmation email sent" : "Email saved for confirmation"}</span>
          <span>{titleizeTime(submittedAt)}</span>
        </div>
      </div>

      <div className="receipt-card premium-receipt confirmed-receipt">
        <div className="receipt-header">
          <div className="receipt-brand">
            <span>Offering Receipt</span>
            <strong>Annakut</strong>
          </div>
          <div className="receipt-status">Submitted</div>
        </div>

        <div className="receipt-meta-row">
          <div>
            <span>Receipt</span>
            <strong>{detailsState.receiptNo || "Confirmed"}</strong>
          </div>
          <div>
            <span>Submitted</span>
            <strong>{titleizeTime(submittedAt)}</strong>
          </div>
        </div>

        <div className="receipt-section">
          <span className="receipt-section-label">Devotee</span>
          <strong className="receipt-devotee-name">{detailsState.fullName || "Devotee"}</strong>
          <p>{detailsState.phone || "-"}</p>
          <p>{detailsState.email || "-"}</p>
        </div>

        <div className="receipt-section">
          <span className="receipt-section-label">Pickup Address</span>
          <p className="receipt-address">{detailsState.address || "-"}</p>
        </div>

        <div className="receipt-section receipt-items-section">
          <div className="receipt-items-heading">
            <span>Offering</span>
          </div>
          <div className="receipt-items">
            {items.map((item) => (
              <div className="receipt-item" key={item.id}>
                <strong>{item.name}</strong>
              </div>
            ))}
          </div>
          <div className="summary-row receipt-total">
            <span>Total items</span>
            <strong>{totalQty(cart)}</strong>
          </div>
        </div>

        <div className="receipt-footer">Thank you for your offering.</div>
      </div>

      <div className="confirm-card email-status-card">
        <strong>Confirmation Delivery</strong>
        <p>
          {detailsState.emailSent
            ? `A confirmation receipt has been sent to ${detailsState.email || "your email address"}.`
            : detailsState.emailError
              ? `The offering was submitted, but the confirmation email could not be sent: ${detailsState.emailError}`
              : "Your offering receipt is shown above. Email sending is available when SMTP is configured on the server."}
        </p>
      </div>

      <div className="footer-actions">
        <ActionButton onClick={finishSession} secondary>
          Done
        </ActionButton>
        <ActionButton onClick={() => navigate("/")} secondary>
          Back to Home
        </ActionButton>
      </div>
    </AppShell>
  );
}

function SubmittedOfferingPage({ offering, setCartState, setDetailsState }) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      resetFlow();
      resetCartSessionId();
      setCartState({});
      setDetailsState({});
      await signOutFirebaseUser();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <AppShell background={backgrounds.confirmed} title="Submitted Offering">
      <div className="receipt-card premium-receipt confirmed-receipt submitted-only-receipt">
        <div className="receipt-header">
          <div className="receipt-brand"><span>Offering Receipt</span><strong>Annakut</strong></div>
          <div className="receipt-status">{offering.status || "submitted"}</div>
        </div>
        <div className="receipt-meta-row">
          <div><span>Receipt</span><strong>{offering.receipt_no || `Offering #${offering.id}`}</strong></div>
          <div><span>Submitted</span><strong>{offering.created_at || "-"}</strong></div>
        </div>
        <div className="receipt-section receipt-items-section">
          <div className="receipt-items-heading"><span>Offering Items</span></div>
          <div className="receipt-items">
            {(offering.items || []).map((item, index) => <div className="receipt-item" key={item.id || `${item.name}-${index}`}><strong>{item.name}</strong></div>)}
          </div>
          <div className="summary-row receipt-total"><span>Total items</span><strong>{offering.items_count || (offering.items || []).length}</strong></div>
        </div>
        <div className="receipt-footer">To change or cancel your submitted offering, please call Rakeshbhai or Sagarbhai.</div>
      </div>
      <div className="confirm-card"><strong>Your offering is already submitted.</strong><p>Only one offering is allowed per person. Please contact Rakeshbhai or Sagarbhai if any changes are required.</p></div>
      <ActionButton danger disabled={loggingOut} onClick={handleLogout}>{loggingOut ? "Logging Out..." : "Log Out"}</ActionButton>
    </AppShell>
  );
}

function HoldCountdown({ seconds }) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return <div className="hold-countdown" role="timer"><span>Items held for</span><strong>{minutes}:{String(remainingSeconds).padStart(2, "0")}</strong></div>;
}

function LoginRulesModal({ onClose }) {
  return (
    <div className="modal-backdrop login-rules-backdrop">
      <div aria-labelledby="login-rules-title" aria-modal="true" className="modal-card login-rules-modal" role="dialog">
        <div className="modal-head"><div><strong id="login-rules-title">Before You Begin</strong><p>Please review these offering rules.</p></div></div>
        <div className="modal-body login-rules-list">
          <div><b>1</b><p>When you add an item to your cart, it is held for 15 minutes. If the transaction is not completed, the item will be released.</p></div>
          <div><b>2</b><p>You can submit only one offering from your profile. To adjust a submitted offering, please contact Rakeshbhai or Sagarbhai.</p></div>
        </div>
        <ActionButton onClick={onClose}>I Understand</ActionButton>
      </div>
    </div>
  );
}

export default function App() {
  const [menu, setMenu] = useState({ categories: [] });
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [cart, setCartState] = useState(() => getCart());
  const [detailsState, setDetailsState] = useState(() => getDetails());
  const [availability, setAvailability] = useState({ taken: new Set(), held: new Set(), ownHeld: new Set(), conflicts: [] });
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessState, setAccessState] = useState({ loading: false, permission: "user", offering: null });
  const [showLoginRules, setShowLoginRules] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [holdExpiredMessage, setHoldExpiredMessage] = useState("");

  useEffect(() => {
    setCart(cart);
  }, [cart]);

  useEffect(() => {
    setDetails(detailsState);
  }, [detailsState]);

  useEffect(() => {
    const holdDeadlineKey = "annakut_hold_deadline_v1";
    if (!Object.keys(cart).length) {
      window.localStorage.removeItem(holdDeadlineKey);
      setHoldSeconds(0);
      return undefined;
    }

    let deadline = Number(window.localStorage.getItem(holdDeadlineKey));
    if (deadline && deadline <= Date.now()) {
      window.localStorage.removeItem(holdDeadlineKey);
      setCartState({});
      setHoldExpiredMessage("Your 15-minute hold expired. The items were released and removed from your cart.");
      return undefined;
    }
    if (!deadline) {
      deadline = Date.now() + 15 * 60 * 1000;
      window.localStorage.setItem(holdDeadlineKey, String(deadline));
    }

    function updateCountdown() {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setHoldSeconds(seconds);
      if (seconds === 0) {
        window.localStorage.removeItem(holdDeadlineKey);
        setCartState({});
        setHoldExpiredMessage("Your 15-minute hold expired. The items were released and removed from your cart.");
      }
    }

    updateCountdown();
    const timerId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timerId);
  }, [cart]);

  useEffect(() => {
    if (!holdExpiredMessage) return undefined;
    const timerId = window.setTimeout(() => setHoldExpiredMessage(""), 8000);
    return () => window.clearTimeout(timerId);
  }, [holdExpiredMessage]);

  useEffect(() => {
    const unsubscribe = onAuthChanged((user) => {
      setFirebaseUser(user);
      if (user?.uid || user?.email) {
        setSessionAuth({
          ...getSessionAuth(),
          uid: user.uid,
          email: user.email || "",
          startedAt: getSessionAuth().startedAt || new Date().toISOString(),
        });
        const rulesKey = `annakut_rules_ack_${user.uid}`;
        setShowLoginRules(window.sessionStorage.getItem(rulesKey) !== "true");
      } else {
        setShowLoginRules(false);
      }
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        const data = await fetchProfile();
        if (cancelled || !data.profile) {
          return;
        }

        const profile = data.profile;
        setSessionAuth({
          ...getSessionAuth(),
          uid: firebaseUser.uid,
          email: profile.email || firebaseUser.email || "",
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          fullName: profile.full_name || "",
          phone: profile.phone || "",
          address: profile.address || "",
          addressLine1: profile.address_line1 || "",
          unitNumber: profile.unit_number || "",
          startedAt: getSessionAuth().startedAt || new Date().toISOString(),
        });
      } catch {
        // Keep local session values if the profile has not been created yet.
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) {
      setAccessState({ loading: false, permission: "user", offering: null });
      return undefined;
    }

    let active = true;
    setAccessState((current) => ({ ...current, loading: true }));
    Promise.all([fetchProfile(), findOfferings()])
      .then(([profileData, offeringData]) => {
        if (!active) return;
        setAccessState({
          loading: false,
          permission: profileData.profile?.permission || "user",
          offering: offeringData.offerings?.[0] || null,
        });
      })
      .catch(() => {
        if (active) setAccessState({ loading: false, permission: "user", offering: null });
      });

    return () => {
      active = false;
    };
  }, [firebaseUser]);

  async function loadMenuData() {
    setMenuLoading(true);
    try {
      const data = await fetchMenu();
      setMenu(data);
      setMenuError("");
    } catch (err) {
      setMenuError(err.message);
    } finally {
      setMenuLoading(false);
    }
  }

  async function refreshAvailability() {
    if (!firebaseUser) {
      setAvailability({ taken: new Set(), held: new Set(), ownHeld: new Set(), conflicts: [] });
      return;
    }

    try {
      const data = await fetchBookedItems(`?session_id=${encodeURIComponent(getCartSessionId())}`);
      setAvailability((current) => ({
        taken: new Set(data.taken_item_ids || []),
        held: new Set(data.held_item_ids || []),
        ownHeld: new Set(data.held_by_session_ids || []),
        conflicts: current.conflicts || [],
      }));
    } catch {
      setAvailability({ taken: new Set(), held: new Set(), ownHeld: new Set(), conflicts: [] });
    }
  }

  useEffect(() => {
    loadMenuData();
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    async function syncHoldsForCart() {
      try {
        await syncCartHolds({
          session_id: getCartSessionId(),
          item_ids: Object.keys(cart),
        });
        setAvailability((current) => ({ ...current, conflicts: [] }));
        await refreshAvailability();
      } catch (error) {
        const conflicts = Array.isArray(error?.data?.conflicts) ? error.data.conflicts : [];
        if (conflicts.length) {
          const conflictedIds = new Set(conflicts.map((item) => item.id).filter(Boolean));
          setCartState((current) => {
            const nextCart = { ...current };
            for (const itemId of conflictedIds) {
              delete nextCart[itemId];
            }
            return nextCart;
          });
          setAvailability((current) => ({
            ...current,
            conflicts,
          }));
          await refreshAvailability();
          return;
        }

        // Polling will refresh availability.
      }
    }

    syncHoldsForCart();
  }, [cart, firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      refreshAvailability();
    }
  }, [firebaseUser]);

  if (!authReady || (firebaseUser && accessState.loading)) {
    return <AppShell background={backgrounds.home} title="Loading" subtitle="Preparing the seva flow" />;
  }

  const hasStaffAccess = ["super_admin", "admin", "orders_status"].includes(accessState.permission);
  if (firebaseUser && accessState.offering && !hasStaffAccess) {
    return <SubmittedOfferingPage offering={accessState.offering} setCartState={setCartState} setDetailsState={setDetailsState} />;
  }

  if (menuLoading) {
    return <AppShell background={backgrounds.home} title="Loading" subtitle="Preparing the seva flow" />;
  }

  if (menuError) {
    return (
      <AppShell background={backgrounds.home} title="Unable to Load" subtitle="Menu data could not be fetched">
        <div className="empty-state">
          <strong>{menuError}</strong>
          <p>Please check that the Node server is running and try again.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <>
      {holdSeconds > 0 ? <HoldCountdown seconds={holdSeconds} /> : null}
      {holdExpiredMessage ? <div className="hold-expired-toast" role="alert">{holdExpiredMessage}</div> : null}
      {showLoginRules && firebaseUser && !hasStaffAccess ? <LoginRulesModal onClose={() => { window.sessionStorage.setItem(`annakut_rules_ack_${firebaseUser.uid}`, "true"); setShowLoginRules(false); }} /> : null}
      <Routes>
      <Route
        element={
          <HomePage
            availability={availability}
            cart={cart}
            cartCount={totalQty(cart)}
            firebaseUser={firebaseUser}
            menu={menu}
            setCartState={setCartState}
            setDetailsState={setDetailsState}
          />
        }
        path="/"
      />
      <Route element={<RulesPage firebaseUser={firebaseUser} />} path="/rules" />
      <Route element={<CategoryPage cartCount={totalQty(cart)} firebaseUser={firebaseUser} menu={menu} />} path="/category" />
      <Route element={<SubcategoryPage cartCount={totalQty(cart)} firebaseUser={firebaseUser} menu={menu} />} path="/subcategory" />
      <Route
        element={
          <FoodListPage
            availability={availability}
            cart={cart}
            firebaseUser={firebaseUser}
            menu={menu}
            refreshAvailability={refreshAvailability}
            setCartState={setCartState}
          />
        }
        path="/food-list"
      />
      <Route element={<CartPage availability={availability} cart={cart} firebaseUser={firebaseUser} setCartState={setCartState} />} path="/cart" />
      <Route
        element={
          <ProfilePage
            cartCount={totalQty(cart)}
            firebaseUser={firebaseUser}
            setCartState={setCartState}
            setDetailsState={setDetailsState}
          />
        }
        path="/profile"
      />
      <Route element={<AdminPage firebaseUser={firebaseUser} menu={menu} setMenu={setMenu} />} path="/admin" />
      <Route
        element={<DetailsPage cart={cart} detailsState={detailsState} firebaseUser={firebaseUser} setDetailsState={setDetailsState} />}
        path="/details"
      />
      <Route
        element={<ReviewPage cart={cart} detailsState={detailsState} firebaseUser={firebaseUser} setCartState={setCartState} setDetailsState={setDetailsState} />}
        path="/review"
      />
      <Route
        element={<ConfirmedPage cart={cart} detailsState={detailsState} setCartState={setCartState} setDetailsState={setDetailsState} />}
        path="/confirmed"
      />
      <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </>
  );
}
