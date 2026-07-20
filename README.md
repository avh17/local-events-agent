# Weekender

Weekender is a local events concierge. A user describes what they feel like doing, and the app finds nearby events that fit their taste, budget, and travel range. Results appear as event cards with the date, venue, price, distance, and a link to book with the ticket seller.

## What it does

- Signs users in with an eight-digit code sent by email.
- Remembers each user's home location, interests, budget, and preferred travel distance.
- Searches for events and turns the results into a short list of useful recommendations.
- Learns from thumbs-up and thumbs-down feedback on event cards.
- Sends opted-in users a weekly email with weekend suggestions.
- Hands booking off to the event seller. Weekender does not collect payments or sell tickets itself.

Budget works as a guide rather than a hard cutoff. Events with no published price, or events priced slightly above a user's limit, can still appear with a clear label. Distance is calculated in a straight line from the user's saved location, so it is not presented as driving time.

Chat history stays in the user's browser. Profiles and event feedback are stored in the database, which means those preferences follow the user when they sign in on another device.

## Services used

| Service | What it does in Weekender |
|---|---|
| Next.js | Runs the website, login screen, chat interface, and server API routes. |
| Vercel | Hosts the application and runs the scheduled weekly digest job. |
| Supabase | Handles email OTP login and stores user profiles and feedback in Postgres. Row Level Security keeps each user's data separate. |
| Claude on Amazon Bedrock | Understands chat requests, decides when to search or update a profile, and turns event data into recommendations. It also selects events for the weekly digest. |
| Ticketmaster Discovery API | Supplies event listings, dates, venues, prices, and booking links. |
| OpenStreetMap Nominatim | Converts a place name or address into coordinates so Weekender can calculate distance. |
| Resend | Delivers the weekly event digest by email. |
