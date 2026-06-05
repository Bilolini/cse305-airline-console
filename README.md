# Airline Operations Console

React + Supabase application for demonstrating the CSE 305 airline reservation database operations.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the Supabase project URL and anon key.

## Supabase RPCs Used

- `generate_flight_from_flight_schedule_date_range`
- `get_route_details`
- `recommend_route`
- `create_booking`
- `pay_booking`
- `cancel_booking`
- `get_revenue_summary`
- `expire_booking_holds`
