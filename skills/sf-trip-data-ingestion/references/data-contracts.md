# Data Contracts

## Events payload (`/api/events`)

Top-level shape:
```json
{
  "meta": {
    "syncedAt": "ISO string or null",
    "calendars": ["https://luma.com/sf", "https://luma.com/cerebralvalley_"],
    "eventCount": 5,
    "source": "convex | omitted"
  },
  "events": [ ... ],
  "places": [ ... ]
}
```

Event object:
```json
{
  "id": "workos-pragmatic",
  "name": "WorkOS AI Night",
  "description": "...",
  "eventUrl": "https://luma.com/...",
  "startDateTimeText": "Monday, February 9, 5:30 PM - 8:00 PM PST",
  "startDateISO": "2026-02-09",
  "locationText": "San Francisco, California",
  "address": "660 Market St, San Francisco, CA 94104, USA",
  "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=..."
}
```

## Static places (`data/static-places.json`)

Place object:
```json
{
  "id": "corner-1",
  "name": "Cafe Réveille",
  "tag": "cafes",
  "location": "610 Long Bridge Street, San Francisco • South of Market",
  "mapLink": "https://www.google.com/maps/search/?api=1&query=...",
  "cornerLink": "https://www.corner.inc/place/2426",
  "curatorComment": "great outdoor and indoor seating",
  "description": "Cozy cafe with sidewalk tables and eclectic breakfast fare.",
  "details": "Serves American and Levantine-inspired dishes..."
}
```

Allowed `tag` values:
- `eat`
- `bar`
- `cafes`
- `go out`
- `shops`
