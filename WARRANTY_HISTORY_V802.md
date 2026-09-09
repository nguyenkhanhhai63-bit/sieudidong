# Warranty history v802

Single flow only:
1. Browser POST /api/warranty-lookup with phone.
2. lib/public-api/warranty-lookup.js calls KiotViet.
3. The exact result object used for the customer response is normalized and LPUSHed to Redis key `sdd:warranty:history:v802` before response.
4. Admin `/api/admin/analytics` reads only that key for `warrantyRecent`.
5. No `/api/warranty-history` endpoint and no browser-side second POST.

This removes all previous history schemas and duplicate browser persistence paths.
