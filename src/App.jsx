import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  CalendarPlus,
  CircleDollarSign,
  Clock,
  CreditCard,
  ArrowRight,
  Heart,
  Loader2,
  MapPinned,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Ticket,
  UserRound
} from "lucide-react";
import {
  calculateCancellationFee,
  cancelBooking,
  createAccount,
  createBooking,
  createFlightSchedule,
  expireBookingHolds,
  findAccountByEmailPassword,
  generateFlights,
  getRevenueSummary,
  getRouteDetails,
  listAircraft,
  listAirlines,
  listAirports,
  listBookings,
  listRoutes,
  listSchedules,
  payBooking,
  updateAccount
} from "./lib/airlineApi";
import { isSupabaseConfigured } from "./lib/supabase";
import { formatDateTime, formatMoney, formatPercent } from "./lib/format";

const tabs = [
  { id: "search", label: "Search", icon: Search },
  { id: "account", label: "Account", icon: UserRound },
  { id: "staff", label: "Staff", icon: CalendarPlus },
  { id: "revenue", label: "Revenue", icon: BarChart3 }
];

const today = new Date().toISOString().slice(0, 10);
const searchStoragePrefix = "airline-search";
const routeRankOptions = [
  ["cheapest", "Cheapest"],
  ["fastest", "Fastest"],
  ["fewestStops", "Fewest stops"],
  ["bestComfort", "Best comfort"]
];

function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage can be unavailable in private browsing or locked-down contexts.
    }
  }, [key, value]);

  return [value, setValue];
}

function formatAirportOption(airport) {
  return `${airport.iata_code} · ${airport.city}, ${airport.country}`;
}

function formatFlightTime(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatDurationMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, "0")}`;
}

function formatTripDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function minutesBetween(start, end) {
  if (!start || !end) return NaN;
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function arrivalDayOffset(start, end) {
  if (!start || !end) return "";
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const days = Math.round((endMidnight - startMidnight) / 86400000);
  return days > 0 ? `+${days}` : "";
}

function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [checkoutSeat, setCheckoutSeat] = useState(null);
  const [airports, setAirports] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [aircraft, setAircraft] = useState([]);
  const [bootState, setBootState] = useState({ loading: false, error: "" });

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    async function boot() {
      setBootState({ loading: true, error: "" });
      try {
        const [airportRows, airlineRows, routeRows, scheduleRows, aircraftRows] = await Promise.all([
          listAirports(),
          listAirlines(),
          listRoutes(),
          listSchedules(),
          listAircraft()
        ]);
        setAirports(airportRows);
        setAirlines(airlineRows);
        setRoutes(routeRows);
        setSchedules(scheduleRows);
        setAircraft(aircraftRows);
      } catch (error) {
        setBootState({ loading: false, error: error.message });
        return;
      }
      setBootState({ loading: false, error: "" });
    }

    boot();
  }, []);

  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? {
    id: "checkout",
    label: "Checkout",
    icon: Ticket
  };

  function openCheckout(seat) {
    setCheckoutSeat(seat);
    setActiveTab("checkout");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Plane size={22} />
          </div>
          <div>
            <h1>Airline Console</h1>
            <p>CSE 305 Reservation System</p>
          </div>
        </div>

        <nav className="tabs" aria-label="Primary">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "tab active" : "tab"}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={17} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <ConnectionStatus bootState={bootState} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{selectedTab.label}</p>
            <h2>{selectedTab.label === "Search" ? "Route Search" : selectedTab.label}</h2>
          </div>
          <button className="iconButton" onClick={() => window.location.reload()} type="button" title="Refresh">
            <RefreshCw size={18} />
          </button>
        </header>

        {!isSupabaseConfigured && <EnvNotice />}
        {bootState.error && <Alert tone="danger" message={bootState.error} />}

        {activeTab === "search" && (
          <SearchPanel airports={airports} onCheckout={openCheckout} />
        )}
        {activeTab === "account" && <AccountPanel />}
        {activeTab === "staff" && (
          <StaffPanel
            schedules={schedules}
            aircraft={aircraft}
            airports={airports}
            airlines={airlines}
            routes={routes}
          />
        )}
        {activeTab === "revenue" && <RevenuePanel />}
        {activeTab === "checkout" && (
          <CheckoutPanel
            seat={checkoutSeat}
            onBack={() => setActiveTab("search")}
          />
        )}
      </section>
    </main>
  );
}

function ConnectionStatus({ bootState }) {
  return (
    <div className="connection">
      <span className={isSupabaseConfigured ? "dot ok" : "dot"} />
      <div>
        <strong>{isSupabaseConfigured ? "Supabase ready" : "Supabase pending"}</strong>
        <p>{bootState.loading ? "Loading reference data" : "Runtime connection"}</p>
      </div>
    </div>
  );
}

function EnvNotice() {
  return (
    <Alert
      tone="warning"
      message="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to connect live data."
    />
  );
}

function Alert({ tone = "info", message }) {
  return (
    <div className={`alert ${tone}`}>
      <ShieldCheck size={18} />
      <span>{message}</span>
    </div>
  );
}

function SearchPanel({ airports, onCheckout }) {
  const [routeRank, setRouteRank] = usePersistentState(`${searchStoragePrefix}:rank`, "cheapest");
  const [stopFilters, setStopFilters] = usePersistentState(`${searchStoragePrefix}:stops`, [0, 1, 2, 3]);
  const [cabinClass, setCabinClass] = usePersistentState(`${searchStoragePrefix}:cabin`, "Economy");
  const [travellers, setTravellers] = usePersistentState(`${searchStoragePrefix}:travellers`, {
    adults: 1,
    children: 0
  });
  const [detailForm, setDetailForm] = usePersistentState(`${searchStoragePrefix}:detail-form`, {
    departureAirportId: "",
    arrivalAirportId: "",
    departureDate: today
  });
  const [routes, setRoutes] = usePersistentState(`${searchStoragePrefix}:routes`, []);
  const [selectedSeat, setSelectedSeat] = usePersistentState(`${searchStoragePrefix}:selected-seat`, null);
  const [state, setState] = useState({ loading: false, error: "", success: "" });
  const airportIdOptions = airports.map((airport) => [
    airport.airport_id,
    formatAirportOption(airport)
  ]);
  const airportTitleByCode = Object.fromEntries(
    airports.map((airport) => [
      airport.iata_code,
      `${airport.airport_name} (${airport.city}, ${airport.country})`
    ])
  );
  const visibleRoutes = routes.filter((route) => stopFilters.includes(route.total_stops));
  const travellerCount = travellers.adults + travellers.children;

  async function runDetails(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const data = await getRouteDetails(detailForm);
      setRoutes(data);
      setSelectedSeat(null);
      return `${data.length} route option${data.length === 1 ? "" : "s"} found`;
    });
  }

  return (
    <div className="searchLayout">
      <section className="panel">
        <PanelHeader icon={MapPinned} title="Flight Search" />

        <form className="formGrid" onSubmit={runDetails}>
          <SelectField
            label="Departure"
            value={detailForm.departureAirportId}
            onChange={(value) => setDetailForm({ ...detailForm, departureAirportId: value })}
            options={airportIdOptions}
            placeholder={airports.length ? "Select airport" : "No airports loaded"}
            disabled={!airports.length}
          />
          <SelectField
            label="Arrival"
            value={detailForm.arrivalAirportId}
            onChange={(value) => setDetailForm({ ...detailForm, arrivalAirportId: value })}
            options={airportIdOptions}
            placeholder={airports.length ? "Select airport" : "No airports loaded"}
            disabled={!airports.length}
          />
          <InputField
            label="Date"
            type="date"
            value={detailForm.departureDate}
            onChange={(value) => setDetailForm({ ...detailForm, departureDate: value })}
          />
          <SubmitButton loading={state.loading} icon={Search} label="Search" />
        </form>

        <ActionState state={state} />
      </section>

      <div className="searchBottom">
        <SearchPreferences
          cabinClass={cabinClass}
          onCabinClassChange={setCabinClass}
          selectedStops={stopFilters}
          onStopsChange={setStopFilters}
          travellers={travellers}
          onTravellersChange={setTravellers}
        />
        <RouteResults
          routes={visibleRoutes}
          selectedSeat={selectedSeat}
          onPickSeat={setSelectedSeat}
          onCheckout={onCheckout}
          cabinClass={cabinClass}
          travellers={travellers}
          travellerCount={travellerCount}
          airportTitleByCode={airportTitleByCode}
          routeRank={routeRank}
          onRouteRankChange={setRouteRank}
        />
      </div>

      {selectedSeat && (
        <section className="panel sideRail">
          <PanelHeader icon={Ticket} title="Selected Seat" />
          <dl className="facts">
            <div>
              <dt>Flight Seat ID</dt>
              <dd>{selectedSeat.flight_seat_id}</dd>
            </div>
            <div>
              <dt>Seat</dt>
              <dd>{selectedSeat.seat_no}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{selectedSeat.seat_class}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>{formatMoney(selectedSeat.price)}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

function SearchPreferences({
  cabinClass,
  onCabinClassChange,
  selectedStops,
  onStopsChange,
  travellers,
  onTravellersChange
}) {
  const stopOptions = [
    [0, "Direct"],
    [1, "1 stop"],
    [2, "2 stops"],
    [3, "3 stops"]
  ];
  const cabinOptions = ["Economy", "Business", "First Class"];

  function toggleStop(stop) {
    if (selectedStops.includes(stop)) {
      onStopsChange(selectedStops.filter((value) => value !== stop));
      return;
    }

    onStopsChange([...selectedStops, stop].sort((a, b) => a - b));
  }

  function updateTraveller(type, delta) {
    onTravellersChange((current) => {
      const minimum = type === "adults" ? 1 : 0;
      const nextValue = Math.max(minimum, current[type] + delta);
      return { ...current, [type]: nextValue };
    });
  }

  return (
    <aside className="panel preferencesPanel">
      <PanelHeader icon={BadgeCheck} title="Preferences" />

      <div className="preferenceSection">
        <span className="preferenceLabel">Cabin Class</span>
        <div className="radioList">
          {cabinOptions.map((option) => (
            <label className="radioField" key={option}>
              <input
                type="radio"
                name="cabinClass"
                checked={cabinClass === option}
                onChange={() => onCabinClassChange(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="preferenceSection">
        <span className="preferenceLabel">Travellers</span>
        <Stepper
          label="Adults"
          detail="Aged 18+"
          value={travellers.adults}
          onMinus={() => updateTraveller("adults", -1)}
          onPlus={() => updateTraveller("adults", 1)}
          minusDisabled={travellers.adults <= 1}
        />
        <Stepper
          label="Children"
          detail="Aged 0 to 17"
          value={travellers.children}
          onMinus={() => updateTraveller("children", -1)}
          onPlus={() => updateTraveller("children", 1)}
          minusDisabled={travellers.children <= 0}
        />
      </div>

      <div className="preferenceSection">
        <span className="preferenceLabel">Stops</span>
        <div className="checkList">
          {stopOptions.map(([stop, label]) => (
            <label className="checkField" key={stop}>
              <input
                type="checkbox"
                checked={selectedStops.includes(stop)}
                onChange={() => toggleStop(stop)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="preferenceSummary">
        <strong>{cabinClass}</strong>
        <span>
          {travellers.adults} adult{travellers.adults === 1 ? "" : "s"} · {travellers.children} child
          {travellers.children === 1 ? "" : "ren"}
        </span>
      </div>
    </aside>
  );
}

function Stepper({ label, detail, value, onMinus, onPlus, minusDisabled }) {
  return (
    <div className="stepper">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="stepperControls">
        <button type="button" onClick={onMinus} disabled={minusDisabled} aria-label={`Decrease ${label}`}>
          -
        </button>
        <span>{value}</span>
        <button type="button" onClick={onPlus} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

function classMatches(className, cabinClass) {
  return className === cabinClass;
}

function hasEnoughSeats(availableSeats, travellerCount) {
  return Number(availableSeats ?? 0) >= travellerCount;
}

function routeSupportsCabin(route, cabinClass, travellerCount) {
  const requiredLegs = route.flight_sequence?.length ?? 1;
  const matchingLegs = (route.available_seats_info ?? []).filter(
    (leg) => classMatches(leg.seat_class, cabinClass) && hasEnoughSeats(leg.available_seats, travellerCount)
  );

  return matchingLegs.length >= requiredLegs;
}

function getCabinLegs(route, cabinClass) {
  return (route.available_seats_info ?? [])
    .filter((leg) => classMatches(leg.seat_class, cabinClass))
    .sort((a, b) => Number(a.leg_no ?? 0) - Number(b.leg_no ?? 0));
}

function getRoutePrice(route, cabinClass) {
  const summaryPrice = (route.route_price_summary ?? []).find(
    (item) => item.seat_class === cabinClass && item.complete_route_class_available
  )?.total_price;

  if (summaryPrice !== null && summaryPrice !== undefined) return Number(summaryPrice);

  return getCabinLegs(route, cabinClass).reduce((total, leg) => total + Number(leg.price ?? 0), 0);
}

function getRouteDealCount(route, cabinClass) {
  const legs = getCabinLegs(route, cabinClass);
  if (!legs.length) return 0;
  return Math.min(...legs.map((leg) => Number(leg.available_seats ?? 0)));
}

function pickFirstCabinSeat(route, cabinClass) {
  const firstLeg = getCabinLegs(route, cabinClass).find((leg) => leg.seat_list?.length);
  const firstSeat = firstLeg?.seat_list?.[0];
  if (!firstSeat || !firstLeg) return null;

  return {
    ...firstSeat,
    seat_class: cabinClass,
    price: firstLeg.price,
    flight_id: firstLeg.flight_id
  };
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getCarrierLabel(route) {
  const carriers = uniqueValues((route.segment_info ?? []).map((segment) => segment.airline_name));
  if (carriers.length) return carriers.join(" + ");
  return route.total_stops === 0 ? "Direct flight" : "Connecting flight";
}

function getRouteDurationMinutes(route) {
  return minutesBetween(route.first_departure_time, route.last_arrival_time);
}

function getRouteComfortScore(route) {
  const stops = Number(route.total_stops ?? 0);
  const wait = Number(route.total_wait_minutes ?? 0);
  const duration = getRouteDurationMinutes(route);
  return stops * 100000 + wait * 100 + duration;
}

function getRouteLegDetails(legs, airportTitleByCode, segmentInfo) {
  const segmentByFlightId = new Map(
    (segmentInfo ?? []).map((segment) => [String(segment.flight_id), segment])
  );

  return legs.map((leg) => {
    const segment = segmentByFlightId.get(String(leg.flight_id));
    return {
      legNo: Number(leg.leg_no ?? 0),
      flightId: leg.flight_id,
      airlineName: segment?.airline_name ?? "Airline",
      flightNo: segment?.flight_no ?? String(leg.flight_id ?? ""),
      originCode: leg.origin_iata ?? "",
      destinationCode: leg.destination_iata ?? "",
      originName: airportTitleByCode[leg.origin_iata] ?? leg.origin_iata ?? "",
      destinationName: airportTitleByCode[leg.destination_iata] ?? leg.destination_iata ?? "",
      departureTime: leg.departure_time,
      arrivalTime: leg.arrival_time,
      seatClass: leg.seat_class,
      price: Number(leg.price ?? 0),
      seatList: (leg.seat_list ?? []).map((seatItem) => ({
        flightSeatId: seatItem.flight_seat_id,
        seatNo: seatItem.seat_no
      }))
    };
  });
}

function getLayoverDetails(legs) {
  return legs.slice(0, -1).map((leg, index) => {
    const nextLeg = legs[index + 1];
    const layoverMinutes = minutesBetween(leg.arrivalTime, nextLeg.departureTime);
    return {
      airportCode: leg.destinationCode,
      airportName: leg.destinationName,
      arrivalTime: leg.arrivalTime,
      departureTime: nextLeg.departureTime,
      duration: formatDurationMinutes(layoverMinutes)
    };
  });
}

function sortRoutes(routes, routeRank, cabinClass) {
  return [...routes].sort((a, b) => {
    const priceA = getRoutePrice(a, cabinClass);
    const priceB = getRoutePrice(b, cabinClass);
    const durationA = getRouteDurationMinutes(a);
    const durationB = getRouteDurationMinutes(b);
    const stopsA = Number(a.total_stops ?? 0);
    const stopsB = Number(b.total_stops ?? 0);
    const comfortA = getRouteComfortScore(a);
    const comfortB = getRouteComfortScore(b);

    if (routeRank === "fastest") {
      return durationA - durationB || priceA - priceB || stopsA - stopsB;
    }
    if (routeRank === "fewestStops") {
      return stopsA - stopsB || durationA - durationB || priceA - priceB;
    }
    if (routeRank === "bestComfort") {
      return comfortA - comfortB || priceA - priceB;
    }
    return priceA - priceB || durationA - durationB || stopsA - stopsB;
  });
}

function StopLine({ totalStops, stopAirports, airportTitleByCode }) {
  if (totalStops === 0) {
    return <em className="direct">Direct</em>;
  }

  return (
    <em className="stopText">
      <strong>{totalStops} stop{totalStops === 1 ? "" : "s"}</strong>
      {stopAirports.map((airport) => (
        <span key={airport} title={airportTitleByCode[airport] ?? airport}>
          {airport}
        </span>
      ))}
    </em>
  );
}

function RouteResults({
  routes,
  selectedSeat,
  onPickSeat,
  onCheckout,
  cabinClass,
  travellers,
  travellerCount,
  airportTitleByCode,
  routeRank,
  onRouteRankChange
}) {
  const cabinRoutes = sortRoutes(
    routes.filter((route) => routeSupportsCabin(route, cabinClass, travellerCount)),
    routeRank,
    cabinClass
  );

  if (!cabinRoutes.length) return <EmptyState icon={MapPinned} title="No matching routes loaded" />;

  return (
    <section className="flightOptionList">
      <div className="rankBar" aria-label="Route ranking">
        {routeRankOptions.map(([value, label]) => (
          <button
            className={routeRank === value ? "rankButton active" : "rankButton"}
            key={value}
            onClick={() => onRouteRankChange(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {cabinRoutes.map((route, index) => {
        const legs = getCabinLegs(route, cabinClass);
        const firstLeg = legs[0];
        const lastLeg = legs[legs.length - 1];
        const stopAirports = legs.slice(0, -1).map((leg) => leg.destination_iata);
        const duration = formatDurationMinutes(
          minutesBetween(route.first_departure_time, route.last_arrival_time)
        );
        const basePrice = getRoutePrice(route, cabinClass);
        const dealCount = getRouteDealCount(route, cabinClass);
        const firstSeat = pickFirstCabinSeat(route, cabinClass);
        const isSelected = firstSeat?.flight_seat_id === selectedSeat?.flight_seat_id;
        const legDetails = getRouteLegDetails(legs, airportTitleByCode, route.segment_info);

        return (
          <button
            className={isSelected ? "flightOption selected" : "flightOption"}
            key={`${route.flight_sequence?.join("-")}-${index}`}
            onClick={() => {
              if (!firstSeat) return;
              const checkoutSeat = {
                ...firstSeat,
                travellers,
                travellerCount,
                routeInfo: {
                  carrier: getCarrierLabel(route),
                  originCode: firstLeg?.origin_iata ?? "",
                  destinationCode: lastLeg?.destination_iata ?? "",
                  originName: airportTitleByCode[firstLeg?.origin_iata] ?? firstLeg?.origin_iata ?? "",
                  destinationName:
                    airportTitleByCode[lastLeg?.destination_iata] ?? lastLeg?.destination_iata ?? "",
                  departureTime: route.first_departure_time,
                  arrivalTime: route.last_arrival_time,
                  duration,
                  stops: route.total_stops,
                  stopAirports,
                  legs: legDetails,
                  layovers: getLayoverDetails(legDetails)
                }
              };
              console.info("Selected flight_seat_id", checkoutSeat.flight_seat_id);
              onPickSeat(checkoutSeat);
              onCheckout(checkoutSeat);
            }}
            type="button"
          >
            <div className="carrierBlock">
              <strong>{getCarrierLabel(route)}</strong>
            </div>

            <div className="timelineBlock">
              <div className="timePoint">
                <PlaneTakeoff size={20} />
                <strong>{formatFlightTime(route.first_departure_time)}</strong>
                <span>{firstLeg?.origin_iata ?? "—"}</span>
              </div>

              <div className="timelineTrack">
                <span>{duration}</span>
                <div className="trackLine">
                  {stopAirports.map((airport) => (
                    <i key={airport} title={airport} />
                  ))}
                </div>
                <StopLine
                  totalStops={route.total_stops}
                  stopAirports={stopAirports}
                  airportTitleByCode={airportTitleByCode}
                />
              </div>

              <div className="timePoint">
                <PlaneLanding size={20} />
                <strong>
                  {formatFlightTime(route.last_arrival_time)}
                  <sup>{arrivalDayOffset(route.first_departure_time, route.last_arrival_time)}</sup>
                </strong>
                <span>{lastLeg?.destination_iata ?? "—"}</span>
              </div>
            </div>

            <div className="dealBlock">
              <Heart size={30} />
              <span>
                {dealCount} deal{dealCount === 1 ? "" : "s"} from
              </span>
              <strong>{formatMoney(basePrice)}</strong>
              <b>
                Select <ArrowRight size={24} />
              </b>
            </div>
          </button>
        );
      })}
    </section>
  );
}

function CheckoutPanel({ seat, onBack }) {
  const [mode, setMode] = useState("login");
  const [checkoutStep, setCheckoutStep] = useState("info");
  const [checkoutAccount, setCheckoutAccount] = useState(null);
  const [selectedLegIndex, setSelectedLegIndex] = useState(0);
  const [selectedSeatChoice, setSelectedSeatChoice] = useState(() => getInitialSeatChoice(seat));
  const [selectedSeatsByLeg, setSelectedSeatsByLeg] = useState(() => getInitialSeatsByLeg(seat));
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [existingAccount, setExistingAccount] = useState(null);
  const [existingForm, setExistingForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "+82",
    email: ""
  });
  const [newForm, setNewForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "+82",
    email: "",
    saveInfo: false,
    password: ""
  });
  const [bookingResult, setBookingResult] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [paymentDeadline, setPaymentDeadline] = useState(null);
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  function switchMode(nextMode) {
    setMode(nextMode);
    setExistingAccount(null);
    setCheckoutAccount(null);
    setBookingResult(null);
    setPaymentResult(null);
    setCheckoutStep("info");
    setState({ loading: false, error: "", success: "" });
  }

  const checkoutSeat = buildCheckoutSeat(seat, selectedSeatChoice);

  async function createBookingForAccount(account) {
    const firstSelectedSeat = selectedSeatsByLeg[0]?.[0];
    const firstLeg = seat.routeInfo?.legs?.[0];
    const seatToHold = firstSelectedSeat
      ? {
          ...buildCheckoutSeat(seat, selectedSeatChoice),
          flight_seat_id: firstSelectedSeat.flightSeatId,
          seat_no: firstSelectedSeat.seatNo,
          flight_id: firstLeg?.flightId,
          price: firstLeg?.price,
          seat_class: firstLeg?.seatClass
        }
      : buildCheckoutSeat(seat, selectedSeatChoice);
    let booking;
    try {
      booking = await createBooking({
        accountId: account.account_id,
        flightSeatId: seatToHold.flight_seat_id
      });
    } catch (error) {
      if (/Flight seat .* does not exist/i.test(error.message)) {
        throw new Error(
          `Could not create a booking hold for flight_seat_id ${seatToHold.flight_seat_id}. The selected option provided this seat ID, but create_booking could not read it. Check that the row exists in flight_seat and that the booking RPC has access to it.`
        );
      }
      throw error;
    }
    setBookingResult({ account, booking });
    setPaymentDeadline(
      booking?.expires_at ?? booking?.v_expires_at ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()
    );
    setCheckoutStep("payment");
    return `Booking ${booking?.booking_id ?? ""} created`;
  }

  async function handleSeatNext(event) {
    event.preventDefault();
    if (!checkoutAccount) {
      setCheckoutStep("info");
      return;
    }
    const travellerCount = getTravellerCountFromSeat(seat);
    const incompleteLeg = (seat.routeInfo?.legs ?? []).findIndex(
      (_leg, index) => (selectedSeatsByLeg[index] ?? []).length < travellerCount
    );
    if (incompleteLeg >= 0) {
      setSelectedLegIndex(incompleteLeg);
      setState({
        loading: false,
        error: `Select ${travellerCount} seat${travellerCount === 1 ? "" : "s"} for flight ${incompleteLeg + 1} first.`,
        success: ""
      });
      return;
    }
    const firstSelectedSeat = selectedSeatsByLeg[0]?.[0];
    if (firstSelectedSeat) {
      const firstLeg = seat.routeInfo?.legs?.[0];
      setSelectedSeatChoice({
        legIndex: 0,
        flightSeatId: firstSelectedSeat.flightSeatId,
        seatNo: firstSelectedSeat.seatNo,
        flightId: firstLeg?.flightId,
        price: firstLeg?.price,
        seatClass: firstLeg?.seatClass
      });
    }
    await runAction(setState, async () => createBookingForAccount(checkoutAccount));
  }

  async function handleConfirmPayment(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const result = await payBooking({
        bookingId: bookingResult?.booking?.booking_id,
        paymentMethod
      });
      setPaymentResult(result);
      return `Payment confirmed for booking ${result?.booking_id ?? bookingResult?.booking?.booking_id ?? ""}`;
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const account = await findAccountByEmailPassword(loginForm);
      setExistingAccount(account);
      setExistingForm({
        firstName: account.first_name ?? "",
        lastName: account.last_name ?? "",
        phoneNumber: account.phone_number ?? "+82",
        email: account.email_address ?? ""
      });
      return "Account loaded";
    });
  }

  async function handleExistingNext(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const phoneNumber = normalizeKoreanPhone(existingForm.phoneNumber);
      if (!isKoreanPhone(phoneNumber)) {
        throw new Error("Phone number must use Korean +82 format.");
      }
      setExistingForm((current) => ({ ...current, phoneNumber }));

      const account = await updateAccount({
        accountId: existingAccount.account_id,
        firstName: existingForm.firstName,
        lastName: existingForm.lastName,
        phoneNumber,
        email: existingForm.email
      });

      setCheckoutAccount(account);
      setCheckoutStep("seat");
      return "Passenger info saved";
    });
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const phoneNumber = normalizeKoreanPhone(newForm.phoneNumber);
      if (!isKoreanPhone(phoneNumber)) {
        throw new Error("Phone number must use Korean +82 format.");
      }
      setNewForm((current) => ({ ...current, phoneNumber }));

      if (newForm.saveInfo && !newForm.password) {
        throw new Error("Password is required when saving information.");
      }

      const account = await createAccount({
        firstName: newForm.firstName,
        lastName: newForm.lastName,
        phoneNumber,
        email: newForm.email,
        password: newForm.saveInfo ? newForm.password : makeGuestPassword()
      });

      setCheckoutAccount(account);
      setCheckoutStep("seat");
      return "Passenger info saved";
    });
  }

  if (!seat) {
    return (
      <section className="panel">
        <PanelHeader icon={Ticket} title="Checkout" />
        <Alert tone="warning" message="Select a flight option before checkout." />
        <button className="primaryButton fitButton" onClick={onBack} type="button">
          <ArrowRight size={17} />
          <span>Search</span>
        </button>
      </section>
    );
  }

  return (
    <div className={checkoutStep === "seat" ? "checkoutFlow seatStepFlow" : "checkoutFlow"}>
      <CheckoutProgress step={checkoutStep} />

      <div className={checkoutStep === "seat" ? "checkoutLayout seatOnly" : "checkoutLayout"}>
        <section className="panel">
          {checkoutStep === "info" ? (
            <PassengerInfoStep
              mode={mode}
              switchMode={switchMode}
              loginForm={loginForm}
              setLoginForm={setLoginForm}
              existingAccount={existingAccount}
              existingForm={existingForm}
              setExistingForm={setExistingForm}
              newForm={newForm}
              setNewForm={setNewForm}
              onBack={onBack}
              onLogin={handleLogin}
              onExistingNext={handleExistingNext}
              onCreateAccount={handleCreateAccount}
              loading={state.loading}
            />
          ) : checkoutStep === "seat" ? (
            <SeatSelectionStep
              seat={seat}
              selectedLegIndex={selectedLegIndex}
              onSelectedLegIndexChange={setSelectedLegIndex}
              selectedSeatChoice={selectedSeatChoice}
              onSelectedSeatChoiceChange={setSelectedSeatChoice}
              selectedSeatsByLeg={selectedSeatsByLeg}
              onSelectedSeatsByLegChange={setSelectedSeatsByLeg}
              onBack={() => setCheckoutStep("info")}
              onNext={handleSeatNext}
              loading={state.loading}
            />
          ) : (
            <PaymentStep
              deadline={paymentDeadline}
              method={paymentMethod}
              onMethodChange={setPaymentMethod}
              onSubmit={handleConfirmPayment}
              amount={getSeatTotal(checkoutSeat)}
              loading={state.loading}
              paymentResult={paymentResult}
            />
          )}

          <ActionState state={state} />
        </section>

        {checkoutStep !== "seat" && (
          <BookingInfoCard seat={checkoutSeat} bookingResult={bookingResult} paymentResult={paymentResult} />
        )}
      </div>
    </div>
  );
}

function CheckoutProgress({ step }) {
  const steps = [
    ["info", "Fill in your info"],
    ["seat", "Choose your seat"],
    ["payment", "Finalize your payment"]
  ];
  const activeIndex = Math.max(0, steps.findIndex(([value]) => value === step));

  return (
    <div className="checkoutProgress">
      {steps.map(([value, label], index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <React.Fragment key={value}>
            <div className={isDone ? "progressItem done" : isActive ? "progressItem active" : "progressItem"}>
              <span>{isDone ? "✓" : index + 1}</span>
              <strong>{label}</strong>
            </div>
            {index < steps.length - 1 && (
              <div className={index < activeIndex ? "progressLine active" : "progressLine"} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PassengerInfoStep({
  mode,
  switchMode,
  loginForm,
  setLoginForm,
  existingAccount,
  existingForm,
  setExistingForm,
  newForm,
  setNewForm,
  onBack,
  onLogin,
  onExistingNext,
  onCreateAccount,
  loading
}) {
  return (
    <>
      <PanelHeader
        icon={Ticket}
        title="Passenger"
        action={
          <div className="buttonGroup">
            <button className="secondaryButton" onClick={onBack} type="button">
              <ArrowRight className="backArrow" size={16} />
              <span>Options</span>
            </button>
            <SegmentedControl
              value={mode}
              onChange={switchMode}
              options={[
                ["login", "Login"],
                ["new", "New"]
              ]}
            />
          </div>
        }
      />

      {mode === "login" ? (
        existingAccount ? (
          <form className="stackForm" onSubmit={onExistingNext}>
            <div className="twoCols">
              <InputField
                label="First Name"
                value={existingForm.firstName}
                onChange={(value) => setExistingForm({ ...existingForm, firstName: value })}
              />
              <InputField
                label="Last Name"
                value={existingForm.lastName}
                onChange={(value) => setExistingForm({ ...existingForm, lastName: value })}
              />
            </div>
            <InputField
              label="Phone Number"
              value={existingForm.phoneNumber}
              onChange={(value) => setExistingForm({ ...existingForm, phoneNumber: value })}
              placeholder="+821012345678"
            />
            <InputField
              label="Email"
              type="email"
              value={existingForm.email}
              onChange={(value) => setExistingForm({ ...existingForm, email: value })}
            />
            <SubmitButton loading={loading} icon={Ticket} label="Next Step" />
          </form>
        ) : (
          <form className="stackForm" onSubmit={onLogin}>
            <InputField
              label="Email"
              type="email"
              value={loginForm.email}
              onChange={(value) => setLoginForm({ ...loginForm, email: value })}
            />
            <InputField
              label="Password"
              type="password"
              value={loginForm.password}
              onChange={(value) => setLoginForm({ ...loginForm, password: value })}
            />
            <SubmitButton loading={loading} icon={UserRound} label="Login" />
          </form>
        )
      ) : (
        <form className="stackForm" onSubmit={onCreateAccount}>
          <div className="twoCols">
            <InputField
              label="First Name"
              value={newForm.firstName}
              onChange={(value) => setNewForm({ ...newForm, firstName: value })}
            />
            <InputField
              label="Last Name"
              value={newForm.lastName}
              onChange={(value) => setNewForm({ ...newForm, lastName: value })}
            />
          </div>
          <InputField
            label="Phone Number"
            value={newForm.phoneNumber}
            onChange={(value) => setNewForm({ ...newForm, phoneNumber: value })}
            placeholder="+821012345678"
          />
          <InputField
            label="Email"
            type="email"
            value={newForm.email}
            onChange={(value) => setNewForm({ ...newForm, email: value })}
          />
          <label className="saveInfoRow">
            <input
              type="checkbox"
              checked={newForm.saveInfo}
              onChange={(event) => setNewForm({ ...newForm, saveInfo: event.target.checked })}
            />
            <span>Save my information</span>
          </label>
          {newForm.saveInfo && (
            <InputField
              label="Password"
              type="password"
              value={newForm.password}
              onChange={(value) => setNewForm({ ...newForm, password: value })}
            />
          )}
          <SubmitButton loading={loading} icon={Ticket} label="Next Step" />
        </form>
      )}
    </>
  );
}

function getInitialSeatChoice(seat) {
  const firstLeg = seat?.routeInfo?.legs?.[0];
  const firstAvailable = firstLeg?.seatList?.[0];
  return {
    legIndex: 0,
    flightSeatId: firstAvailable?.flightSeatId ?? seat?.flight_seat_id,
    seatNo: firstAvailable?.seatNo ?? seat?.seat_no,
    flightId: firstLeg?.flightId ?? seat?.flight_id,
    price: firstLeg?.price ?? seat?.price,
    seatClass: firstLeg?.seatClass ?? seat?.seat_class
  };
}

function getInitialSeatsByLeg(seat) {
  return (seat?.routeInfo?.legs ?? []).reduce((selected, leg, index) => {
    selected[index] = [];
    return selected;
  }, {});
}

function getTravellerCountFromSeat(seat) {
  const travellers = seat?.travellers ?? { adults: 1, children: 0 };
  return seat?.travellerCount ?? travellers.adults + travellers.children;
}

function buildCheckoutSeat(baseSeat, selectedSeatChoice) {
  return {
    ...baseSeat,
    flight_seat_id: selectedSeatChoice?.flightSeatId ?? baseSeat.flight_seat_id,
    seat_no: selectedSeatChoice?.seatNo ?? baseSeat.seat_no,
    flight_id: selectedSeatChoice?.flightId ?? baseSeat.flight_id,
    price: selectedSeatChoice?.price ?? baseSeat.price,
    seat_class: selectedSeatChoice?.seatClass ?? baseSeat.seat_class
  };
}

function parseSeatLabel(seatNo) {
  const match = String(seatNo ?? "").match(/^(\d+)([A-Z])$/i);
  if (!match) return null;
  return {
    row: Number(match[1]),
    letter: match[2].toUpperCase()
  };
}

function buildAircraftSeatLayout(seatList) {
  const availableSeats = seatList ?? [];
  const parsedSeats = availableSeats.map((seatItem) => ({
    seatItem,
    parsed: parseSeatLabel(seatItem.seatNo)
  })).filter((item) => item.parsed);

  const availableBySeatNo = new Map(
    availableSeats.map((seatItem) => [String(seatItem.seatNo).toUpperCase(), seatItem])
  );

  if (!parsedSeats.length) {
    return {
      letters: ["A", "B", "C", "D", "E", "F"],
      rows: []
    };
  }

  const minRow = Math.min(...parsedSeats.map((item) => item.parsed.row));
  const maxRow = Math.max(...parsedSeats.map((item) => item.parsed.row));
  const highestLetterIndex = Math.max(
    5,
    ...parsedSeats.map((item) => item.parsed.letter.charCodeAt(0) - 65)
  );
  const letters = Array.from({ length: highestLetterIndex + 1 }, (_, index) =>
    String.fromCharCode(65 + index)
  );

  return {
    letters,
    rows: Array.from({ length: maxRow - minRow + 1 }, (_, index) => {
      const rowNumber = minRow + index;
      return {
        rowNumber,
        seats: letters.map((letter) => {
          const seatNo = `${rowNumber}${letter}`;
          return {
            seatNo,
            seatItem: availableBySeatNo.get(seatNo) ?? null
          };
        })
      };
    })
  };
}

function SeatSelectionStep({
  seat,
  selectedLegIndex,
  onSelectedLegIndexChange,
  selectedSeatChoice,
  onSelectedSeatChoiceChange,
  selectedSeatsByLeg,
  onSelectedSeatsByLegChange,
  onBack,
  onNext,
  loading
}) {
  const legs = seat.routeInfo?.legs ?? [];
  const selectedLeg = legs[selectedLegIndex] ?? legs[0];
  const flightSlots = legs.slice(0, 4);
  const seats = selectedLeg?.seatList ?? [];
  const travellerCount = getTravellerCountFromSeat(seat);
  const selectedSeatsForCurrentLeg = selectedSeatsByLeg[selectedLegIndex] ?? [];
  const selectedSeatIdsForCurrentLeg = new Set(
    selectedSeatsForCurrentLeg.map((seatItem) => String(seatItem.flightSeatId))
  );
  const allSeatsSelectedForCurrentLeg = selectedSeatsForCurrentLeg.length >= travellerCount;
  const canGoPrevious = selectedLegIndex > 0;
  const canGoNext = selectedLegIndex < legs.length - 1 && allSeatsSelectedForCurrentLeg;
  const aircraftLayout = buildAircraftSeatLayout(seats);

  function pickSeatForLeg(leg, index, seatItem) {
    if (!leg || !seatItem) return;
    const existing = selectedSeatsByLeg[index] ?? [];
    const alreadySelected = existing.some(
      (existingSeat) => String(existingSeat.flightSeatId) === String(seatItem.flightSeatId)
    );
    const nextSeatsForLeg = alreadySelected
      ? existing.filter((existingSeat) => String(existingSeat.flightSeatId) !== String(seatItem.flightSeatId))
      : [...existing, seatItem].slice(-travellerCount);
    onSelectedSeatsByLegChange((current) => ({
      ...current,
      [index]: nextSeatsForLeg
    }));
    onSelectedLegIndexChange(index);
    const bookingSeat = nextSeatsForLeg.at(-1) ?? seatItem;
    onSelectedSeatChoiceChange({
      legIndex: index,
      flightSeatId: bookingSeat.flightSeatId,
      seatNo: bookingSeat.seatNo,
      flightId: leg.flightId,
      price: leg.price,
      seatClass: leg.seatClass
    });
  }

  function pickSeat(seatItem) {
    pickSeatForLeg(selectedLeg, selectedLegIndex, seatItem);
  }

  function pickLeg(leg, index) {
    onSelectedLegIndexChange(index);
    const firstSeat = selectedSeatsByLeg[index]?.[0];
    if (firstSeat) {
      onSelectedSeatChoiceChange({
        legIndex: index,
        flightSeatId: firstSeat.flightSeatId,
        seatNo: firstSeat.seatNo,
        flightId: leg.flightId,
        price: leg.price,
        seatClass: leg.seatClass
      });
    }
  }

  function goToLeg(nextIndex) {
    const leg = legs[nextIndex];
    if (leg) {
      pickLeg(leg, nextIndex);
    }
  }

  return (
    <>
      <PanelHeader
        icon={Ticket}
        title="Choose Your Seat"
        action={
          <button className="secondaryButton" onClick={onBack} type="button">
            <ArrowRight className="backArrow" size={16} />
            <span>Info</span>
          </button>
        }
      />

      <div className="flightPartGrid">
        {flightSlots.map((leg, index) => (
          <section
            className={selectedLegIndex === index ? "flightPart active" : "flightPart"}
            key={index}
          >
            {leg ? (
              <>
                <button className="flightPartInfo" onClick={() => pickLeg(leg, index)} type="button">
                  <strong>{leg.flightNo}</strong>
                  <span>{leg.airlineName}</span>
                  <b>{leg.originCode} → {leg.destinationCode}</b>
                  <small>{formatFlightTime(leg.departureTime)}</small>
                  <small>{formatFlightTime(leg.arrivalTime)}</small>
                </button>
                <div className="flightPartSeats">
                  {Array.from({ length: 8 }, (_, seatIndex) => {
                    const selectedSeat = selectedSeatsByLeg[index]?.[seatIndex];
                    return selectedSeat ? (
                      <SeatPickButton
                        compact
                        isSelected
                        key={selectedSeat.flightSeatId}
                        onPick={() => pickSeatForLeg(leg, index, selectedSeat)}
                        seatNo={selectedSeat.seatNo}
                      />
                    ) : (
                      <span className="seatPick emptySlot" key={`empty-${index}-${seatIndex}`}>—</span>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flightPartEmpty">
                <strong>Flight {index + 1}</strong>
                <span>Not used</span>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="seatFlightBar">
        <button
          className="secondaryButton"
          disabled={!canGoPrevious}
          onClick={() => goToLeg(selectedLegIndex - 1)}
          type="button"
        >
          Previous Aircraft
        </button>
        {selectedLeg && (
          <h3 className="seatFlightTitle">{selectedLeg.flightNo}</h3>
        )}
        <button
          className="secondaryButton"
          disabled={!canGoNext}
          onClick={() => goToLeg(selectedLegIndex + 1)}
          type="button"
          title={
            canGoNext || selectedLegIndex >= legs.length - 1
              ? ""
              : `Select ${travellerCount} seat${travellerCount === 1 ? "" : "s"} for this flight first`
          }
        >
          Next Aircraft
        </button>
      </div>

      <div className="seatMapPanel">
        <div className="seatMapHeader">
          <strong>{selectedLeg?.originCode} → {selectedLeg?.destinationCode}</strong>
          <span>
            {selectedSeatsForCurrentLeg.length}/{travellerCount} selected
          </span>
        </div>
        <div className="aircraftCabin">
          <div className="cabinEmptySpace" />
          <div className="aircraftSeatMap">
            {aircraftLayout.rows.map((row) => (
              <div className="aircraftSeatColumn" key={row.rowNumber}>
                {row.seats.map((seatCell, seatIndex) => (
                  <React.Fragment key={seatCell.seatNo}>
                    {seatIndex === Math.ceil(row.seats.length / 2) && <span className="aircraftAisleDot" />}
                    {seatCell.seatItem ? (
                      <SeatPickButton
                        isSelected={selectedSeatIdsForCurrentLeg.has(String(seatCell.seatItem.flightSeatId))}
                        onPick={() => pickSeat(seatCell.seatItem)}
                        seatNo={seatCell.seatNo}
                      />
                    ) : (
                      <span className="seatPick occupied" title={`Seat ${seatCell.seatNo} occupied`}>
                        {seatCell.seatNo}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <form className="stackForm" onSubmit={onNext}>
        <SubmitButton loading={loading} icon={Ticket} label="Next Step" />
      </form>
    </>
  );
}

function SeatPickButton({ seatNo, isSelected, onPick, compact = false }) {
  return (
    <button
      className={`${isSelected ? "seatPick selected" : "seatPick"}${compact ? " compact" : ""}`}
      onClick={onPick}
      type="button"
      title={`Seat ${seatNo}`}
    >
      {seatNo}
    </button>
  );
}

function PaymentStep({ deadline, method, onMethodChange, onSubmit, amount, loading, paymentResult }) {
  const remaining = useCountdown(deadline);
  const methods = [
    ["CREDIT_CARD", "Credit Card"],
    ["MOBILE_PAY", "Mobile Pay"],
    ["BANK_TRANSFER", "Bank Transfer"],
    ["PAYPAL", "PayPal"]
  ];

  return (
    <>
      <PanelHeader icon={CreditCard} title="Finalize Your Payment" />
      <div className="holdNotice">
        <Clock size={18} />
        <span>Please secure your booking within {remaining}</span>
      </div>
      <form className="stackForm" onSubmit={onSubmit}>
        <div className="paymentMethods">
          {methods.map(([value, label]) => (
            <label className={method === value ? "paymentMethod active" : "paymentMethod"} key={value}>
              <input
                type="radio"
                name="paymentMethod"
                value={value}
                checked={method === value}
                onChange={() => onMethodChange(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <SubmitButton
          loading={loading}
          icon={CreditCard}
          label={`Confirm and Pay ${formatMoney(amount)}`}
        />
      </form>
      {paymentResult && (
        <div className="bookingReceipt">
          <strong>Payment Confirmed</strong>
          <span>Ticket {paymentResult.ticket_no ?? "issued"}</span>
        </div>
      )}
    </>
  );
}

function BookingInfoCard({ seat, bookingResult, paymentResult }) {
  const info = seat.routeInfo ?? {};
  const layovers = info.layovers ?? [];
  const itineraryLegs = info.legs ?? [];
  const total = getSeatTotal(seat);
  return (
    <section className="panel bookingInfoPanel">
      <PanelHeader icon={Plane} title="Booking Info" />
      <BookingRouteMini info={info} />
      {itineraryLegs.length > 0 && (
        <ItineraryDetails legs={itineraryLegs} layovers={layovers} total={total} />
      )}
      <PriceDetails seat={seat} />
      {bookingResult && (
        <div className="bookingReceipt">
          <strong>Booking Held</strong>
          <span>Booking #{bookingResult.booking?.booking_id ?? "—"}</span>
        </div>
      )}
      {paymentResult && (
        <div className="bookingReceipt">
          <strong>Ready to Ticket</strong>
          <span>{paymentResult.ticket_no ?? "Ticket issued"}</span>
        </div>
      )}
    </section>
  );
}

function BookingRouteMini({ info }) {
  const stopAirports = info.stopAirports ?? [];
  return (
    <div className="bookingRouteMini">
      <div className="miniCarrier">
        <Plane size={18} />
        <strong>{info.carrier ?? "Flight"}</strong>
      </div>

      <div className="miniTimeline">
        <div className="miniPoint">
          <PlaneTakeoff size={17} />
          <strong>{formatFlightTime(info.departureTime)}</strong>
          <span>{info.originCode || "—"}</span>
        </div>

        <div className="miniTrack">
          <span>{info.duration ?? "—"}</span>
          <div className="miniTrackLine">
            {stopAirports.map((airport) => (
              <i key={airport} />
            ))}
          </div>
          <StopLine
            totalStops={Number(info.stops ?? 0)}
            stopAirports={stopAirports}
            airportTitleByCode={Object.fromEntries(
              (info.layovers ?? []).map((layover) => [layover.airportCode, layover.airportName])
            )}
          />
        </div>

        <div className="miniPoint">
          <PlaneLanding size={17} />
          <strong>
            {formatFlightTime(info.arrivalTime)}
            <sup>{arrivalDayOffset(info.departureTime, info.arrivalTime)}</sup>
          </strong>
          <span>{info.destinationCode || "—"}</span>
        </div>
      </div>
    </div>
  );
}

function ItineraryDetails({ legs, layovers, total }) {
  return (
    <div className="itineraryDetails">
      {legs.map((leg, index) => (
        <React.Fragment key={`${leg.flightId}-${index}`}>
          <div className="itineraryLeg">
            <div className="segmentCarrier">
              <Plane size={18} />
              <span>{leg.airlineName} {leg.flightNo}</span>
            </div>
            <div className="segmentTimeline">
              <span>{formatFlightTime(leg.departureTime)}</span>
              <div className="segmentLine" />
              <p><strong>{leg.originCode}</strong> {leg.originName}</p>
              <span className="segmentDuration">
                <Clock size={15} />
                {formatDurationMinutes(minutesBetween(leg.departureTime, leg.arrivalTime))}
              </span>
              <small>Flight duration</small>
              <span>{formatFlightTime(leg.arrivalTime)}</span>
              <p><strong>{leg.destinationCode}</strong> {leg.destinationName}</p>
            </div>
          </div>
          {layovers[index] && (
            <div className="connectionBreak">
              <span>{layovers[index].duration}</span>
              <p>Connect in airport</p>
              <strong>{layovers[index].airportCode}</strong>
            </div>
          )}
        </React.Fragment>
      ))}
      {layovers.length > 0 && (
        <div className="itineraryTotal">
          <span>Total cost</span>
          <strong>{formatMoney(total)}</strong>
        </div>
      )}
    </div>
  );
}

function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!deadline) return "00:15:00";
  const remainingMs = Math.max(0, new Date(deadline).getTime() - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function PriceDetails({ seat }) {
  const travellers = seat.travellers ?? { adults: 1, children: 0 };
  const travellerCount = seat.travellerCount ?? travellers.adults + travellers.children;
  const ticketLabel = buildTicketLabel(travellers);
  const total = Number(seat.price ?? 0) * travellerCount;

  return (
    <div className="priceDetails">
      <div className="priceLine">
        <span>Ticket ({ticketLabel})</span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <div className="priceDivider" />
      <div className="priceLine total">
        <span>Total</span>
        <strong>{formatMoney(total)}</strong>
      </div>
    </div>
  );
}

function getSeatTotal(seat) {
  const travellers = seat.travellers ?? { adults: 1, children: 0 };
  const travellerCount = seat.travellerCount ?? travellers.adults + travellers.children;
  return Number(seat.price ?? 0) * travellerCount;
}

function buildTicketLabel(travellers) {
  const parts = [];
  if (travellers.adults) {
    parts.push(`${travellers.adults} adult${travellers.adults === 1 ? "" : "s"}`);
  }
  if (travellers.children) {
    parts.push(`${travellers.children} child${travellers.children === 1 ? "" : "ren"}`);
  }
  return parts.join(", ") || "1 adult";
}

function normalizeKoreanPhone(value) {
  const raw = String(value ?? "").replace(/[\s-()]/g, "");
  if (raw.startsWith("+82")) return raw;
  if (raw.startsWith("82")) return `+${raw}`;
  if (raw.startsWith("0")) return `+82${raw.slice(1)}`;
  return raw;
}

function isKoreanPhone(value) {
  return /^\+82\d{8,11}$/.test(value);
}

function makeGuestPassword() {
  return `guest-${crypto.randomUUID?.() ?? Date.now()}`;
}

function AccountPanel() {
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [account, setAccount] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingView, setBookingView] = useState("current");
  const [cancellationPreview, setCancellationPreview] = useState(null);
  const [state, setState] = useState({ loading: false, error: "", success: "" });
  const currentBookings = bookings.filter(isCurrentBooking);
  const pastBookings = bookings.filter((booking) => !isCurrentBooking(booking));
  const visibleBookings = bookingView === "current" ? currentBookings : pastBookings;

  async function loadBookings(accountId) {
    const data = await listBookings(accountId);
    setBookings(data);
    return data;
  }

  async function handleLogin(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const nextAccount = await findAccountByEmailPassword(loginForm);
      setAccount(nextAccount);
      const data = await loadBookings(nextAccount.account_id);
      return `${data.length} booking${data.length === 1 ? "" : "s"} loaded`;
    });
  }

  async function handleRefresh() {
    if (!account) return;
    await runAction(setState, async () => {
      const data = await loadBookings(account.account_id);
      return `${data.length} booking${data.length === 1 ? "" : "s"} refreshed`;
    });
  }

  async function handlePreviewCancel(booking) {
    await runAction(setState, async () => {
      let feeInfo = null;
      if (booking.booking_status === "CONFIRMED") {
        feeInfo = await calculateCancellationFee(booking.booking_id);
      }
      setCancellationPreview({ booking, feeInfo });
      return "Cancellation preview loaded";
    });
  }

  async function handleConfirmCancel() {
    if (!account || !cancellationPreview) return;
    await runAction(setState, async () => {
      await cancelBooking({
        accountId: account.account_id,
        bookingId: cancellationPreview.booking.booking_id
      });
      setCancellationPreview(null);
      const data = await loadBookings(account.account_id);
      return `${data.length} booking${data.length === 1 ? "" : "s"} refreshed`;
    });
  }

  if (!account) {
    return (
      <div className="contentGrid">
        <section className="panel accountLoginPanel">
          <PanelHeader icon={UserRound} title="Account Login" />
          <form className="stackForm" onSubmit={handleLogin}>
            <InputField
              label="Email"
              type="email"
              value={loginForm.email}
              onChange={(value) => setLoginForm({ ...loginForm, email: value })}
            />
            <InputField
              label="Password"
              type="password"
              value={loginForm.password}
              onChange={(value) => setLoginForm({ ...loginForm, password: value })}
            />
            <SubmitButton loading={state.loading} icon={UserRound} label="Login" />
          </form>
          <ActionState state={state} />
        </section>
      </div>
    );
  }

  return (
    <div className="contentGrid">
      <section className="panel">
        <PanelHeader icon={UserRound} title="Customer Account" />
        <ActionState state={state} />
        <dl className="facts compactFacts">
          <div>
            <dt>Account</dt>
            <dd>#{account.account_id}</dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{account.first_name} {account.last_name}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{account.phone_number}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{account.email_address}</dd>
          </div>
        </dl>
      </section>

      <section className="panel wide">
        <PanelHeader
          icon={Ticket}
          title={bookingView === "current" ? "Current Bookings" : "Past Bookings"}
          action={
            <div className="buttonGroup">
              <SegmentedControl
                value={bookingView}
                onChange={(value) => {
                  setBookingView(value);
                  setCancellationPreview(null);
                }}
                options={[
                  ["current", "Current"],
                  ["past", "Past"]
                ]}
              />
              <button
                className="iconButton"
                onClick={handleRefresh}
                type="button"
                title="Refresh bookings"
                disabled={!account}
              >
                <RefreshCw size={17} />
              </button>
            </div>
          }
        />
        <BookingTable
          bookings={visibleBookings}
          onCancelPick={bookingView === "current" ? handlePreviewCancel : undefined}
          activePreview={cancellationPreview}
          onConfirmCancel={handleConfirmCancel}
          onDismissCancel={() => setCancellationPreview(null)}
          cancelLoading={state.loading}
        />
      </section>
    </div>
  );
}

function isCurrentBooking(booking) {
  const departure = booking.flight_seat?.flight?.departure_ts;
  const isUpcoming = departure ? new Date(departure).getTime() >= Date.now() : true;
  return isUpcoming && ["PENDING_PAYMENT", "CONFIRMED"].includes(booking.booking_status);
}

function CancellationPreview({ preview, onConfirm, onDismiss, loading }) {
  const { booking, feeInfo } = preview;
  const payment = Array.isArray(booking.payment) ? booking.payment[0] : booking.payment;
  const paidAmount = feeInfo?.paid_amount ?? payment?.amount ?? 0;
  const fee = feeInfo?.cancellation_fee ?? 0;
  const refund = feeInfo?.refund_amount ?? 0;
  const policy = feeInfo?.policy_name ?? "No refund needed before payment";

  return (
    <div className="cancelPreview">
      <div className="classGrid">
        <div className="metric">
          <span>Paid Amount</span>
          <strong>{formatMoney(paidAmount)}</strong>
        </div>
        <div className="metric">
          <span>Cancellation Fee</span>
          <strong>{formatMoney(fee)}</strong>
        </div>
        <div className="metric">
          <span>Refund</span>
          <strong>{formatMoney(refund)}</strong>
        </div>
        <div className="metric">
          <span>Policy</span>
          <strong>{policy}</strong>
        </div>
      </div>
      <div className="buttonGroup">
        <button className="secondaryButton" onClick={onDismiss} type="button">
          Keep Booking
        </button>
        <button className="dangerButton" onClick={onConfirm} disabled={loading} type="button">
          <RotateCcw size={17} />
          <span>Confirm Cancellation</span>
        </button>
      </div>
    </div>
  );
}

function BookingPanel({ accountId }) {
  const [createForm, setCreateForm] = useState({ accountId, flightSeatId: "" });
  const [payForm, setPayForm] = useState({ bookingId: "", paymentMethod: "CARD" });
  const [cancelForm, setCancelForm] = useState({ accountId, bookingId: "" });
  const [bookings, setBookings] = useState([]);
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  useEffect(() => {
    setCreateForm((current) => ({ ...current, accountId }));
    setCancelForm((current) => ({ ...current, accountId }));
  }, [accountId]);

  async function refreshBookings() {
    const data = await listBookings(accountId);
    setBookings(data);
    return `${data.length} booking${data.length === 1 ? "" : "s"} loaded`;
  }

  async function handleCreate(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const result = await createBooking(createForm);
      const bookingId = result?.booking_id ?? result?.p_booking_id;
      if (bookingId) setPayForm((current) => ({ ...current, bookingId }));
      await refreshBookings();
      return `Booking ${bookingId ?? ""} held`;
    });
  }

  async function handlePay(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const result = await payBooking(payForm);
      await refreshBookings();
      return `Ticket ${result?.ticket_no ?? ""} issued`;
    });
  }

  async function handleCancel(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const result = await cancelBooking(cancelForm);
      await refreshBookings();
      return `Booking ${result?.booking_id ?? cancelForm.bookingId} cancelled`;
    });
  }

  async function handleExpire() {
    await runAction(setState, async () => {
      const count = await expireBookingHolds();
      await refreshBookings();
      return `${count ?? 0} expired hold${count === 1 ? "" : "s"} cleared`;
    });
  }

  async function handleRefresh() {
    await runAction(setState, refreshBookings);
  }

  return (
    <div className="contentGrid">
      <section className="panel">
        <PanelHeader icon={Ticket} title="Hold Seat" />
        <form className="stackForm" onSubmit={handleCreate}>
          <InputField
            label="Account"
            value={createForm.accountId}
            onChange={(value) => setCreateForm({ ...createForm, accountId: value })}
          />
          <InputField
            label="Flight Seat ID"
            value={createForm.flightSeatId}
            onChange={(value) => setCreateForm({ ...createForm, flightSeatId: value })}
          />
          <SubmitButton loading={state.loading} icon={Ticket} label="Hold" />
        </form>
      </section>

      <section className="panel">
        <PanelHeader icon={CreditCard} title="Payment" />
        <form className="stackForm" onSubmit={handlePay}>
          <InputField
            label="Booking ID"
            value={payForm.bookingId}
            onChange={(value) => setPayForm({ ...payForm, bookingId: value })}
          />
          <InputField
            label="Method"
            value={payForm.paymentMethod}
            onChange={(value) => setPayForm({ ...payForm, paymentMethod: value })}
          />
          <SubmitButton loading={state.loading} icon={CreditCard} label="Pay" />
        </form>
      </section>

      <section className="panel">
        <PanelHeader icon={RotateCcw} title="Cancel" />
        <form className="stackForm" onSubmit={handleCancel}>
          <InputField
            label="Account"
            value={cancelForm.accountId}
            onChange={(value) => setCancelForm({ ...cancelForm, accountId: value })}
          />
          <InputField
            label="Booking ID"
            value={cancelForm.bookingId}
            onChange={(value) => setCancelForm({ ...cancelForm, bookingId: value })}
          />
          <SubmitButton loading={state.loading} icon={RotateCcw} label="Cancel" />
        </form>
      </section>

      <section className="panel wide">
        <PanelHeader
          icon={Clock}
          title="Bookings"
          action={
            <div className="buttonGroup">
              <button className="iconButton" onClick={handleExpire} type="button" title="Expire holds">
                <Clock size={17} />
              </button>
              <button className="iconButton" onClick={handleRefresh} type="button" title="Refresh bookings">
                <RefreshCw size={17} />
              </button>
            </div>
          }
        />
        <ActionState state={state} />
        <BookingTable
          bookings={bookings}
          onCancelPick={(booking) => setCancelForm({ accountId, bookingId: String(booking.booking_id) })}
        />
      </section>
    </div>
  );
}

function BookingTable({
  bookings,
  onCancelPick,
  activePreview,
  onConfirmCancel,
  onDismissCancel,
  cancelLoading
}) {
  if (!bookings.length) return <EmptyState icon={Ticket} title="No bookings loaded" />;
  const showActions = Boolean(onCancelPick);
  const columnCount = showActions ? 7 : 6;

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Route</th>
            <th>Seat</th>
            <th>Amount</th>
            <th>Ticket</th>
            {showActions && <th></th>}
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const seat = booking.flight_seat;
            const flight = seat?.flight;
            const route = flight?.flight_schedule?.route;
            const payment = Array.isArray(booking.payment) ? booking.payment[0] : booking.payment;
            const ticket = Array.isArray(booking.ticket) ? booking.ticket[0] : booking.ticket;
            const isPreviewOpen = activePreview?.booking?.booking_id === booking.booking_id;
            return (
              <React.Fragment key={booking.booking_id}>
                <tr className={isPreviewOpen ? "bookingRow active" : "bookingRow"}>
                  <td>{booking.booking_id}</td>
                  <td><StatusBadge value={booking.booking_status} /></td>
                  <td>
                    {route?.departure?.iata_code ?? "—"} → {route?.arrival?.iata_code ?? "—"}
                    <small>{formatDateTime(flight?.departure_ts)}</small>
                  </td>
                  <td>{seat?.aircraft_model_seat?.seat_no ?? "—"}</td>
                  <td>{formatMoney(payment?.amount ?? seat?.seat_price)}</td>
                  <td>{ticket?.ticket_no ?? "—"}</td>
                  {showActions && (
                    <td>
                      <button
                        className="dangerButton compactButton"
                        onClick={() => onCancelPick(booking)}
                        type="button"
                        title="Preview cancellation fee"
                      >
                        Cancel
                      </button>
                    </td>
                  )}
                </tr>
                {isPreviewOpen && (
                  <tr className="previewRow">
                    <td colSpan={columnCount}>
                      <CancellationPreview
                        preview={activePreview}
                        onConfirm={onConfirmCancel}
                        onDismiss={onDismissCancel}
                        loading={cancelLoading}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const weekdayOptions = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"]
];

function StaffPanel({ schedules, aircraft, airports, airlines, routes }) {
  const [localSchedules, setLocalSchedules] = useState(schedules);
  const [scheduleForm, setScheduleForm] = useState({
    airlineId: "",
    flightNo: "",
    departureAirportId: "",
    arrivalAirportId: "",
    departureTime: "09:00",
    arrivalTime: "11:00",
    validFrom: today,
    validTo: today,
    dayOfWeek: 1
  });
  const [form, setForm] = useState({
    scheduleId: "",
    aircraftId: "",
    dateFrom: today,
    dateTo: today,
    firstPrice: 1800,
    businessPrice: 900,
    economyPrice: 300
  });
  const [generated, setGenerated] = useState([]);
  const [state, setState] = useState({ loading: false, error: "", success: "" });
  const airportById = new Map(airports.map((airport) => [String(airport.airport_id), airport]));
  const airlineById = new Map(airlines.map((airline) => [String(airline.airline_id), airline]));
  const routeById = new Map(routes.map((route) => [String(route.route_id), route]));
  const selectedSchedule = localSchedules.find((schedule) => String(schedule.schedule_id) === String(form.scheduleId));
  const generationAirlineId = selectedSchedule?.airline_id;
  const aircraftOptions = aircraft
    .filter((item) => !generationAirlineId || String(item.airline_id) === String(generationAirlineId))
    .map((item) => [
      item.aircraft_id,
      `${item.registration_no} · ${item.aircraft_code ?? "Aircraft"} · ${item.aircraft_status}`
    ]);
  const routeExists = routes.some((route) =>
    String(route.departure_airport_id) === String(scheduleForm.departureAirportId)
    && String(route.arrival_airport_id) === String(scheduleForm.arrivalAirportId)
  );

  useEffect(() => {
    setLocalSchedules(schedules);
  }, [schedules]);

  async function handleCreateSchedule(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const schedule = await createFlightSchedule(scheduleForm);
      const nextSchedule = {
        ...schedule,
        day_of_week: Number(scheduleForm.dayOfWeek)
      };
      setLocalSchedules((current) => [...current, nextSchedule]);
      setForm((current) => ({ ...current, scheduleId: String(schedule.schedule_id), aircraftId: "" }));
      return `Schedule #${schedule.schedule_id} created`;
    });
  }

  async function handleGenerate(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const data = await generateFlights(form);
      setGenerated(data);
      return `${data.length} flight${data.length === 1 ? "" : "s"} generated`;
    });
  }

  return (
    <div className="contentGrid">
      <section className="panel">
        <PanelHeader icon={CalendarPlus} title="Create Flight Schedule" />
        <form className="stackForm" onSubmit={handleCreateSchedule}>
          <SelectField
            label="Airline"
            value={scheduleForm.airlineId}
            onChange={(value) => {
              setScheduleForm({ ...scheduleForm, airlineId: value });
              setForm((current) => ({ ...current, aircraftId: "" }));
            }}
            options={airlines.map((airline) => [
              airline.airline_id,
              `${airline.airline_code} · ${airline.airline_name}`
            ])}
            placeholder="Select airline"
            disabled={!airlines.length}
          />
          <InputField
            label="Flight No"
            value={scheduleForm.flightNo}
            onChange={(value) => setScheduleForm({ ...scheduleForm, flightNo: value })}
            placeholder="703"
          />
          <div className="twoCols">
            <SelectField
              label="Departure"
              value={scheduleForm.departureAirportId}
              onChange={(value) => setScheduleForm({ ...scheduleForm, departureAirportId: value })}
              options={airports.map((airport) => [airport.airport_id, formatAirportOption(airport)])}
              placeholder="Select airport"
              disabled={!airports.length}
            />
            <SelectField
              label="Arrival"
              value={scheduleForm.arrivalAirportId}
              onChange={(value) => setScheduleForm({ ...scheduleForm, arrivalAirportId: value })}
              options={airports.map((airport) => [airport.airport_id, formatAirportOption(airport)])}
              placeholder="Select airport"
              disabled={!airports.length}
            />
          </div>
          {scheduleForm.departureAirportId && scheduleForm.arrivalAirportId && !routeExists && (
            <Alert tone="warning" message="No existing route found for this airport pair." />
          )}
          <div className="twoCols">
            <InputField
              label="Departure Time"
              type="time"
              value={scheduleForm.departureTime}
              onChange={(value) => setScheduleForm({ ...scheduleForm, departureTime: value })}
            />
            <InputField
              label="Arrival Time"
              type="time"
              value={scheduleForm.arrivalTime}
              onChange={(value) => setScheduleForm({ ...scheduleForm, arrivalTime: value })}
            />
          </div>
          <div className="twoCols">
            <InputField
              label="Valid From"
              type="date"
              value={scheduleForm.validFrom}
              onChange={(value) => setScheduleForm({ ...scheduleForm, validFrom: value })}
            />
            <InputField
              label="Valid To"
              type="date"
              value={scheduleForm.validTo}
              onChange={(value) => setScheduleForm({ ...scheduleForm, validTo: value })}
            />
          </div>
          <SelectField
            label="Day of Week"
            value={scheduleForm.dayOfWeek}
            onChange={(value) => setScheduleForm({ ...scheduleForm, dayOfWeek: value })}
            options={weekdayOptions}
          />
          <SubmitButton loading={state.loading} icon={CalendarPlus} label="Create Schedule" />
        </form>
        <ActionState state={state} />
      </section>

      <section className="panel">
        <PanelHeader icon={CalendarPlus} title="Generate Flights" />
        <form className="stackForm" onSubmit={handleGenerate}>
          <SelectField
            label="Schedule"
            value={form.scheduleId}
            onChange={(value) => setForm({ ...form, scheduleId: value, aircraftId: "" })}
            options={localSchedules.map((schedule) => [
              schedule.schedule_id,
              scheduleOptionLabel(schedule, airportById, airlineById, routeById)
            ])}
            placeholder="Select schedule"
            disabled={!localSchedules.length}
          />
          <SelectField
            label="Aircraft"
            value={form.aircraftId}
            onChange={(value) => setForm({ ...form, aircraftId: value })}
            options={aircraftOptions}
            placeholder={form.scheduleId ? "Select aircraft" : "Choose schedule first"}
            disabled={!form.scheduleId || !aircraftOptions.length}
          />
          <div className="twoCols">
            <InputField
              label="From"
              type="date"
              value={form.dateFrom}
              onChange={(value) => setForm({ ...form, dateFrom: value })}
            />
            <InputField
              label="To"
              type="date"
              value={form.dateTo}
              onChange={(value) => setForm({ ...form, dateTo: value })}
            />
          </div>
          <div className="threeCols">
            <InputField
              label="First"
              type="number"
              value={form.firstPrice}
              onChange={(value) => setForm({ ...form, firstPrice: value })}
            />
            <InputField
              label="Business"
              type="number"
              value={form.businessPrice}
              onChange={(value) => setForm({ ...form, businessPrice: value })}
            />
            <InputField
              label="Economy"
              type="number"
              value={form.economyPrice}
              onChange={(value) => setForm({ ...form, economyPrice: value })}
            />
          </div>
          <SubmitButton loading={state.loading} icon={CalendarPlus} label="Generate" />
        </form>
        <ActionState state={state} />
      </section>

      <section className="panel wide">
        <PanelHeader icon={Plane} title="Generated Flights" />
        {generated.length ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Flight</th>
                  <th>Schedule</th>
                  <th>Aircraft</th>
                  <th>Departure</th>
                  <th>Arrival</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {generated.map((flight) => (
                  <tr key={flight.flight_id}>
                    <td>{flight.flight_id}</td>
                    <td>{flight.schedule_id}</td>
                    <td>{flight.aircraft_id}</td>
                    <td>{formatDateTime(flight.departure_ts)}</td>
                    <td>{formatDateTime(flight.arrival_ts)}</td>
                    <td><StatusBadge value={flight.flight_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Plane} title="No generated flights loaded" />
        )}
      </section>
    </div>
  );
}

function scheduleOptionLabel(schedule, airportById, airlineById, routeById) {
  const airline = airlineById.get(String(schedule.airline_id));
  const route = routeById.get(String(schedule.route_id));
  const departure = airportById.get(String(route?.departure_airport_id));
  const arrival = airportById.get(String(route?.arrival_airport_id));
  const routeLabel = departure && arrival
    ? `${departure.iata_code} → ${arrival.iata_code}`
    : `route ${schedule.route_id}`;
  const day = weekdayOptions.find(([value]) => Number(value) === Number(schedule.day_of_week))?.[1];
  return [
    `#${schedule.schedule_id}`,
    `${airline?.airline_code ?? "Airline"}${schedule.flight_no ? ` ${schedule.flight_no}` : ""}`,
    routeLabel,
    `${schedule.departure_time?.slice(0, 5) ?? "--:--"}-${schedule.arrival_time?.slice(0, 5) ?? "--:--"}`,
    day,
    `${schedule.valid_from} to ${schedule.valid_to}`,
    schedule.schedule_status
  ].filter(Boolean).join(" · ");
}

function RevenuePanel() {
  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
    groupBy: "month"
  });
  const [rows, setRows] = useState([]);
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        bookings: acc.bookings + Number(row.total_bookings ?? 0),
        paid: acc.paid + Number(row.paid_bookings ?? 0),
        cancelled: acc.cancelled + Number(row.cancelled_bookings ?? 0),
        gross: acc.gross + Number(row.gross_revenue ?? 0),
        refunds: acc.refunds + Number(row.refund_amount ?? 0),
        net: acc.net + Number(row.net_revenue ?? 0)
      }),
      { bookings: 0, paid: 0, cancelled: 0, gross: 0, refunds: 0, net: 0 }
    );
  }, [rows]);

  async function handleSubmit(event) {
    event.preventDefault();
    await runAction(setState, async () => {
      const data = await getRevenueSummary(form);
      setRows(data);
      return `${data.length} revenue row${data.length === 1 ? "" : "s"} loaded`;
    });
  }

  return (
    <div className="contentGrid">
      <section className="panel">
        <PanelHeader icon={CircleDollarSign} title="Revenue Query" />
        <form className="stackForm" onSubmit={handleSubmit}>
          <InputField
            label="Start"
            type="date"
            value={form.startDate}
            onChange={(value) => setForm({ ...form, startDate: value })}
          />
          <InputField
            label="End"
            type="date"
            value={form.endDate}
            onChange={(value) => setForm({ ...form, endDate: value })}
          />
          <SelectField
            label="Group"
            value={form.groupBy}
            onChange={(value) => setForm({ ...form, groupBy: value })}
            options={[
              ["day", "Day"],
              ["month", "Month"],
              ["quarter", "Quarter"],
              ["year", "Year"],
              ["overall", "Overall"]
            ]}
          />
          <SubmitButton loading={state.loading} icon={BarChart3} label="Run" />
        </form>
        <ActionState state={state} />
      </section>

      <section className="panel wide">
        <PanelHeader icon={BarChart3} title="Summary" />
        <div className="classGrid">
          <div className="metric">
            <span>Bookings</span>
            <strong>{totals.bookings}</strong>
          </div>
          <div className="metric">
            <span>Paid</span>
            <strong>{totals.paid}</strong>
          </div>
          <div className="metric">
            <span>Cancelled</span>
            <strong>{totals.cancelled}</strong>
          </div>
          <div className="metric">
            <span>Gross</span>
            <strong>{formatMoney(totals.gross)}</strong>
          </div>
          <div className="metric">
            <span>Refunds</span>
            <strong>{formatMoney(totals.refunds)}</strong>
          </div>
          <div className="metric">
            <span>Net</span>
            <strong>{formatMoney(totals.net)}</strong>
          </div>
        </div>

        {rows.length ? (
          <>
            <RevenueVisuals rows={rows} groupBy={form.groupBy} />
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Bookings</th>
                    <th>Paid</th>
                    <th>Cancelled</th>
                    <th>Gross</th>
                    <th>Refunds</th>
                    <th>Net</th>
                    <th>Cancel Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.period_label}>
                      <td>{row.period_label}</td>
                      <td>{row.total_bookings}</td>
                      <td>{row.paid_bookings}</td>
                      <td>{row.cancelled_bookings}</td>
                      <td>{formatMoney(row.gross_revenue)}</td>
                      <td>{formatMoney(row.refund_amount)}</td>
                      <td>{formatMoney(row.net_revenue)}</td>
                      <td>{formatPercent(row.cancellation_rate_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState icon={BarChart3} title="No revenue loaded" />
        )}
      </section>
    </div>
  );
}

function RevenueVisuals({ rows, groupBy }) {
  const chartRows = rows.map((row) => ({
    label: row.period_label ?? "Period",
    bookings: Number(row.total_bookings ?? 0),
    paid: Number(row.paid_bookings ?? 0),
    cancelled: Number(row.cancelled_bookings ?? 0),
    gross: Number(row.gross_revenue ?? 0),
    refunds: Number(row.refund_amount ?? 0),
    net: Number(row.net_revenue ?? 0)
  }));
  const showPointValues = groupBy === "month";

  return (
    <div className="revenueVisuals">
      <MetricLineChart
        rows={chartRows}
        metric="bookings"
        title="Bookings"
        subtitle="Total bookings by period."
        color="#2563eb"
        showPointValues={showPointValues}
      />
      <MetricLineChart
        rows={chartRows}
        metric="cancelled"
        title="Cancelled"
        subtitle="Cancelled bookings by period."
        color="#c62868"
        showPointValues={showPointValues}
      />
      <MoneyFlowChart rows={chartRows} />
    </div>
  );
}

function MetricLineChart({ rows, metric, title, subtitle, color, showPointValues }) {
  const width = 720;
  const height = 260;
  const pad = { top: 24, right: 18, bottom: 58, left: 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...rows.map((row) => row[metric]));
  const points = rows.map((row, index) => {
    const x = rows.length === 1
      ? pad.left + innerWidth / 2
      : pad.left + (index / (rows.length - 1)) * innerWidth;
    const y = pad.top + innerHeight - (row[metric] / maxValue) * innerHeight;
    return { x, y, row, value: row[metric] };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="chartCard">
      <ChartHeader title={title} subtitle={subtitle} />
      <svg className="revenueChart lineChart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend chart`}>
        <line x1={pad.left} y1={pad.top + innerHeight} x2={width - pad.right} y2={pad.top + innerHeight} />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerHeight} />
        <text x={pad.left - 8} y={pad.top + 5} textAnchor="end">{Math.ceil(maxValue)}</text>
        <text x={pad.left - 8} y={pad.top + innerHeight} textAnchor="end">0</text>
        <polyline points={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.row.label}>
            <circle cx={point.x} cy={point.y} r="5" fill={color}>
              <title>{`${point.row.label}: ${title} ${point.value}`}</title>
            </circle>
            {showPointValues && (
              <text className="pointValue" x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle">
                {point.value}
              </text>
            )}
            <text x={point.x} y={height - 22} textAnchor="middle">{shortChartLabel(point.row.label)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MoneyFlowChart({ rows }) {
  const maxGross = Math.max(1, ...rows.map((row) => row.gross));

  return (
    <div className="chartCard moneyFlowCard">
      <ChartHeader title="Revenue Flow" subtitle="Net revenue and refunds as parts of gross revenue." />
      <ChartLegend items={[["Net", "#0f8a5f"], ["Refunds", "#d24b35"], ["Gross baseline", "#dce6eb"]]} />
      <div className="moneyBars">
        {rows.map((row) => {
          const netWidth = Math.max(0, (row.net / maxGross) * 100);
          const refundWidth = Math.max(0, (row.refunds / maxGross) * 100);
          return (
            <div className="moneyBarRow" key={row.label}>
              <span>{row.label}</span>
              <div className="moneyBarTrack" title={`${row.label}: gross ${formatMoney(row.gross)}, refunds ${formatMoney(row.refunds)}, net ${formatMoney(row.net)}`}>
                <i className="moneyNet" style={{ width: `${netWidth}%` }} />
                <i className="moneyRefund" style={{ width: `${refundWidth}%` }} />
              </div>
              <strong>{formatMoney(row.gross)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartHeader({ title, subtitle }) {
  return (
    <div className="chartHeader">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}

function ChartLegend({ items }) {
  return (
    <div className="chartLegend">
      {items.map(([label, color]) => (
        <span key={label}>
          <i style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function shortChartLabel(label) {
  const text = String(label ?? "");
  return text.length > 10 ? `${text.slice(0, 9)}...` : text;
}

function PanelHeader({ icon: Icon, title, action }) {
  return (
    <div className="panelHeader">
      <div>
        <Icon size={18} />
        <h3>{title}</h3>
      </div>
      {action}
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "Select", disabled = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map(([optionValue, optionLabel]) => (
        <button
          className={value === optionValue ? "active" : ""}
          key={optionValue}
          onClick={() => onChange(optionValue)}
          type="button"
        >
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

function SubmitButton({ loading, icon: Icon, label }) {
  return (
    <button className="primaryButton" disabled={loading} type="submit">
      {loading ? <Loader2 className="spin" size={17} /> : <Icon size={17} />}
      <span>{label}</span>
    </button>
  );
}

function ActionState({ state }) {
  if (state.error) return <Alert tone="danger" message={state.error} />;
  if (state.success) return <Alert tone="success" message={state.success} />;
  return null;
}

function StatusBadge({ value }) {
  return <span className={`status ${String(value ?? "").toLowerCase()}`}>{value ?? "—"}</span>;
}

function EmptyState({ icon: Icon, title }) {
  return (
    <section className="empty">
      <Icon size={24} />
      <span>{title}</span>
    </section>
  );
}

async function runAction(setState, action) {
  setState({ loading: true, error: "", success: "" });
  try {
    const success = await action();
    setState({ loading: false, error: "", success });
  } catch (error) {
    setState({ loading: false, error: error.message, success: "" });
  }
}

export default App;
