# Firecrawl Prompts Used

## Discover Luma event URLs
```
Extract upcoming Luma event page URLs from these calendar pages.
Return only URLs for individual events with pattern https://luma.com/<event-slug>.
Do not include calendar overview pages like /sf, /cerebralvalley_, or map pages.
```

## Extract event details from one event page
```
Extract details for this specific Luma event page only.
Return null or empty string for missing fields.
Do not infer a different event from unrelated pages.
Use the given URL as url.
```

## Extract Corner static places
```
Extract all places in this specific Corner list.
For each place include: name, tag (eat/bar/cafes/go out/shops if inferable),
location text, direct place URL, best map URL if shown,
curatorComment (the curator note/comment for this place in this list if present),
shortDescription, and any important details.
```

## Notes
- Firecrawl extract may return an async job id; poll `/v1/extract/{id}` until `status=completed`.
- Corner map links are often missing; generate Google Maps query URLs from location text.
