import { requireSupabase } from "./supabase";

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function findAccountByEmailPassword(values) {
  const email = cleanText(values.email).toLowerCase();
  const password = cleanText(values.password);
  const passwordHash = await hashPassword(values.password);
  const { data, error } = await requireSupabase()
    .from("account")
    .select("account_id,email_address,password_hash,first_name,last_name,phone_number")
    .eq("email_address", email)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || ![password, passwordHash].includes(data.password_hash)) {
    throw new Error("No account matched that email and password.");
  }

  const { password_hash, ...account } = data;
  return account;
}

export async function findStaffByEmailPassword(values) {
  const account = await findAccountByEmailPassword(values);
  const { data, error } = await requireSupabase()
    .from("staff")
    .select("staff_id,staff_role")
    .eq("staff_id", account.account_id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("This account is not authorized for staff pages.");
  }

  return {
    ...account,
    staff_id: data.staff_id,
    staff_role: data.staff_role
  };
}

export async function createAccount(values) {
  const passwordHash = await hashPassword(values.password);
  const { data, error } = await requireSupabase()
    .from("account")
    .insert({
      email_address: cleanText(values.email).toLowerCase(),
      password_hash: passwordHash,
      phone_number: cleanText(values.phoneNumber),
      first_name: cleanText(values.firstName),
      last_name: cleanText(values.lastName)
    })
    .select("account_id,email_address,first_name,last_name,phone_number")
    .single();

  if (error) throw error;

  const { error: customerError } = await requireSupabase()
    .from("customer")
    .upsert({ customer_id: data.account_id }, { onConflict: "customer_id" });

  if (customerError) throw customerError;
  return data;
}

export async function updateAccount(values) {
  const { data, error } = await requireSupabase()
    .from("account")
    .update({
      email_address: cleanText(values.email).toLowerCase(),
      phone_number: cleanText(values.phoneNumber),
      first_name: cleanText(values.firstName),
      last_name: cleanText(values.lastName)
    })
    .eq("account_id", cleanNumber(values.accountId))
    .select("account_id,email_address,first_name,last_name,phone_number")
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? {
    account_id: cleanNumber(values.accountId),
    email_address: cleanText(values.email).toLowerCase(),
    first_name: cleanText(values.firstName),
    last_name: cleanText(values.lastName),
    phone_number: cleanText(values.phoneNumber)
  };
}

export async function listAirports() {
  const { data, error } = await requireSupabase()
    .from("airport")
    .select("airport_id,iata_code,airport_name,city,country,time_zone")
    .order("iata_code", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listSchedules() {
  const { data, error } = await requireSupabase()
    .from("flight_schedule")
    .select("schedule_id,flight_no,airline_id,route_id,departure_time,arrival_time,valid_from,valid_to,schedule_status")
    .order("schedule_id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listAirlines() {
  const { data, error } = await requireSupabase()
    .from("airline")
    .select("airline_id,airline_code,airline_name")
    .order("airline_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listRoutes() {
  const { data, error } = await requireSupabase()
    .from("route")
    .select("route_id,departure_airport_id,arrival_airport_id")
    .order("route_id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listAircraft() {
  const { data, error } = await requireSupabase()
    .from("aircraft")
    .select("aircraft_id,registration_no,aircraft_code,airline_id,aircraft_status")
    .order("aircraft_id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createFlightSchedule(values) {
  const departureAirportId = cleanNumber(values.departureAirportId);
  const arrivalAirportId = cleanNumber(values.arrivalAirportId);
  if (departureAirportId === arrivalAirportId) {
    throw new Error("Departure and arrival airports must be different.");
  }

  const { data: route, error: routeError } = await requireSupabase()
    .from("route")
    .select("route_id")
    .eq("departure_airport_id", departureAirportId)
    .eq("arrival_airport_id", arrivalAirportId)
    .limit(1)
    .maybeSingle();

  if (routeError) throw routeError;
  if (!route) {
    throw new Error("No route exists for this airport pair. Create the route in the database first.");
  }

  const { data: schedule, error: scheduleError } = await requireSupabase()
    .from("flight_schedule")
    .insert({
      flight_no: cleanText(values.flightNo),
      airline_id: cleanNumber(values.airlineId),
      route_id: route.route_id,
      departure_time: values.departureTime,
      arrival_time: values.arrivalTime,
      valid_from: values.validFrom,
      valid_to: values.validTo,
      schedule_status: "ACTIVE"
    })
    .select("schedule_id,flight_no,airline_id,route_id,departure_time,arrival_time,valid_from,valid_to,schedule_status")
    .single();

  if (scheduleError) throw scheduleError;

  const { error: dayError } = await requireSupabase()
    .from("flight_schedule_day")
    .insert({
      schedule_id: schedule.schedule_id,
      day_of_week: cleanNumber(values.dayOfWeek)
    });

  if (dayError) throw dayError;
  return schedule;
}

export async function listBookings(accountId) {
  const query = requireSupabase()
    .from("booking")
    .select(`
      booking_id,
      account_id,
      flight_seat_id,
      booking_ts,
      booking_status,
      expires_at,
      confirmed_at,
      cancelled_at,
      payment(amount,payment_status,payment_method),
      ticket(ticket_no,ticket_status),
      refund(amount,refund_status,cancellation_fee),
      flight_seat(
        seat_price,
        seat_status,
        flight(
          flight_id,
          departure_ts,
          arrival_ts,
          flight_schedule(
            flight_no,
            route(
              departure:airport!route_departure_airport_id_fkey(iata_code,city),
              arrival:airport!route_arrival_airport_id_fkey(iata_code,city)
            )
          )
        ),
        aircraft_model_seat(seat_no,seat_class(class_name))
      )
    `)
    .order("booking_ts", { ascending: false });

  if (accountId) query.eq("account_id", cleanNumber(accountId));

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).sort((a, b) => {
    const aTime = a.flight_seat?.flight?.departure_ts;
    const bTime = b.flight_seat?.flight?.departure_ts;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
}

export async function getRouteDetails(values) {
  const { data, error } = await requireSupabase().rpc("get_route_details", {
    p_departure_airport_id: cleanNumber(values.departureAirportId),
    p_arrival_airport_id: cleanNumber(values.arrivalAirportId),
    p_departure_date: values.departureDate
  });

  if (error) throw error;
  return enrichRoutesWithSegments(data ?? []);
}

export async function recommendRoute(values) {
  const { data, error } = await requireSupabase().rpc("recommend_route", {
    p_account_id: cleanNumber(values.accountId),
    p_departure_airport_code: cleanText(values.departureCode),
    p_arrival_airport_code: cleanText(values.arrivalCode),
    p_departure_local_ts: values.departureLocalTs,
    p_max_results: cleanNumber(values.maxResults)
  });

  if (error) throw error;
  return enrichRoutesWithSegments(data ?? []);
}

async function enrichRoutesWithSegments(routes) {
  const flightIds = [
    ...new Set(routes.flatMap((route) => route.flight_sequence ?? []).filter(Boolean))
  ];

  if (!flightIds.length) return routes;

  const { data, error } = await requireSupabase()
    .from("flight")
    .select(`
      flight_id,
      aircraft_id,
      flight_schedule(
        flight_no,
        airline(airline_code,airline_name)
      ),
      aircraft(
        aircraft_code,
        registration_no,
        airline(airline_code,airline_name)
      )
    `)
    .in("flight_id", flightIds);

  if (error) {
    return routes;
  }

  const segmentById = new Map((data ?? []).map((segment) => [segment.flight_id, segment]));

  return routes.map((route) => ({
    ...route,
    segment_info: (route.flight_sequence ?? []).map((flightId) => {
      const segment = segmentById.get(flightId);
      const scheduleAirline = segment?.flight_schedule?.airline;
      const aircraftAirline = segment?.aircraft?.airline;
      const airline = scheduleAirline ?? aircraftAirline;
      const airlineCode = airline?.airline_code ?? "";
      const flightNo = segment?.flight_schedule?.flight_no ?? String(flightId);

      return {
        flight_id: flightId,
        airline_code: airlineCode,
        airline_name: airline?.airline_name ?? (airlineCode || "Airline"),
        flight_no: airlineCode ? `${airlineCode}${flightNo}` : flightNo,
        aircraft_code: segment?.aircraft?.aircraft_code ?? "",
        registration_no: segment?.aircraft?.registration_no ?? ""
      };
    })
  }));
}

export async function createBooking(values) {
  const { data, error } = await requireSupabase().rpc("create_booking", {
    p_account_id: cleanNumber(values.accountId),
    p_flight_seat_id: cleanNumber(values.flightSeatId)
  });

  if (error) throw error;
  return data?.[0] ?? data;
}

export async function payBooking(values) {
  const { data, error } = await requireSupabase().rpc("pay_booking", {
    p_booking_id: cleanNumber(values.bookingId),
    p_payment_method: cleanText(values.paymentMethod) || "CARD"
  });

  if (error) throw error;
  return data?.[0] ?? data;
}

export async function cancelBooking(values) {
  const { data, error } = await requireSupabase().rpc("cancel_booking", {
    p_account_id: cleanNumber(values.accountId),
    p_booking_id: cleanNumber(values.bookingId)
  });

  if (error) throw error;
  return data?.[0] ?? data;
}

export async function calculateCancellationFee(bookingId) {
  const { data, error } = await requireSupabase().rpc("calculate_cancellation_fee", {
    p_booking_id: cleanNumber(bookingId)
  });

  if (error) throw error;
  return data?.[0] ?? data;
}

export async function expireBookingHolds() {
  const { data, error } = await requireSupabase().rpc("expire_booking_holds");

  if (error) throw error;
  return data;
}

export async function generateFlights(values) {
  const { data, error } = await requireSupabase().rpc(
    "generate_flight_from_flight_schedule_date_range",
    {
      p_schedule_id: cleanNumber(values.scheduleId),
      p_date_from: values.dateFrom,
      p_date_to: values.dateTo,
      p_aircraft_id: cleanNumber(values.aircraftId),
      p_first_price: cleanNumber(values.firstPrice),
      p_business_price: cleanNumber(values.businessPrice),
      p_economy_price: cleanNumber(values.economyPrice)
    }
  );

  if (error) throw error;
  return data ?? [];
}

export async function getRevenueSummary(values) {
  const { data, error } = await requireSupabase().rpc("get_revenue_summary", {
    p_start_date: values.startDate || null,
    p_end_date: values.endDate || null,
    p_group_by: values.groupBy
  });

  if (error) throw error;
  return data ?? [];
}
