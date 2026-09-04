# substack-scripts

A small TypeScript toolkit for inspecting and managing Substack recommendations.

> This uses undocumented, authenticated Substack web endpoints. It may stop working if Substack changes its UI/API. Review the list carefully before confirming.

## Authentication / input

The script needs the **browser Cookie header**, not a bearer token or API key. In your browser, open the Substack publication dashboard, copy the relevant cookies from the Recommendations request in Developer Tools, and provide them through an environment variable or a file. Do not commit or share this value; session cookies grant access to your account.

```sh
cp .env.example .env
# Edit .env and set SUBSTACK_HOST and SUBSTACK_COOKIE.
```

`SUBSTACK_HOST` and `SUBSTACK_COOKIE` are required and must be set in `.env` or the environment. They are not accepted as command-line arguments.

## Install and run

Requires Node.js 20+.

```sh
npm install
npm run build
# Remove non-reciprocal recommendations (asks for confirmation)
npm run remove -- --dry-run
npm run remove

# Show all publications you recommend, sorted by subscriber count
npm run list
```

For development without compiling:

```sh
npm run dev -- remove --dry-run
```

Commands:

- `npm run list`: show every publication you recommend, sorted by subscriber count
- `npm run remove`: remove recommendations that do not recommend you back

Options:

- `--dry-run`: fetch and display candidates but never send a DELETE request (applies to `remove`)

The remove command prints every non-reciprocal outgoing recommendation and requires you to type `DELETE` before making any changes. It deletes candidates one at a time and reports individual failures. The list command prints each publication's own `freeSubscriberCount` from Substack, rather than the number of subscribers your recommendation generated.

## API notes

The implementation follows the request patterns captured from the Recommendations page. The host and cookie are always configured through environment variables:

- `GET /api/v1/recommendations/stats/to` for incoming recommendations
- `GET /api/v1/recommendations/stats/from` for outgoing recommendations

The API currently returns a `rows` array and accepts `limit=10`; the script paginates until all rows are loaded.
- `DELETE /api/v1/recommendations/` with `recommending_publication_id`, `recommended_publication_id`, and `source: "recommendation-stats"`

The DELETE request uses the payload observed in the Recommendations UI:

```json
{
  "recommending_publication_id": 123,
  "recommended_publication_id": 456,
  "source": "recommendation-stats"
}
```

The command always displays candidates and requires explicit confirmation before deletion.
