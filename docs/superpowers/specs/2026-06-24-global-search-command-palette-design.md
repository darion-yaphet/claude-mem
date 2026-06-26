# Global Search Command Palette Design

Date: 2026-06-24

## Goal

Add global search to the existing claude-mem web viewer without turning the viewer into a multi-page dashboard. The feature should let users search memory, sessions, prompts, files, and concepts from the top of the UI, inspect concrete results, and quickly pivot from aggregate file/concept results into a new concrete search.

## Non-Goals

- No dedicated Search page or route in the first version.
- No always-visible inline search bar in the header.
- No active filter row, filter label, or persistent filter chips.
- No corpus management, timeline, decisions, or changes UI in this scope.
- No new backend search endpoints unless the existing JSON search responses are insufficient during implementation.

## User Experience

The header gets a compact Search control. Activating it opens a command-palette style overlay above the existing feed. The feed remains the primary page and is not replaced.

The overlay contains one search input and one result-type dropdown aligned to the right side of the input. The dropdown is single-select because the result scope is deterministic:

- All types
- Memory
- Sessions
- Prompts
- Files
- Concepts

Results render as one dense list. Each row has a left-side type label, a primary title, secondary metadata, and a right-side affordance such as timestamp or `Open` / `Search`.

The UI does not show `Filters`, active filter chips, or a second row unless it is needed for status text such as loading or empty results.

## Result Behavior

Memory, Session, and Prompt rows represent concrete records. Clicking one opens a detail drawer. If the corresponding feed item is already loaded or can be loaded cheaply, the feed item is scrolled into view and briefly highlighted. If not, the drawer still opens with the fetched detail.

File and Concept rows are aggregate pivots, not persistent filters. Clicking one replaces the search input value with the file path or concept name and reruns the search with `All types`. This keeps the interaction direct and avoids hidden scoped state. The user can edit or clear the input to return to broader search.

## Data Flow

The command palette should prefer existing JSON APIs:

- General search: `GET /api/search?query=<q>&type=<scope>&format=json`
- File pivot search: replace `query` with the selected file text and use the same endpoint first.
- Concept pivot search: replace `query` with the selected concept text and use the same endpoint first.
- Concrete details:
  - `GET /api/observation/:id`
  - `GET /api/session/:id`
  - `GET /api/prompt/:id`

The frontend should normalize returned observations, sessions, and prompts into one result row model. File and Concept rows may be derived from result metadata such as `files_read`, `files_modified`, and `concepts` when the backend does not return first-class file/concept rows.

## Component Design

Add small, focused UI units under `src/ui/viewer`:

- `SearchButton`: header control that opens the palette.
- `SearchCommandPalette`: overlay, keyboard handling, query state, type dropdown, and result states.
- `SearchResultsList`: normalized list rendering.
- `SearchResultRow`: one result row with a left-side type label.
- `SearchDetailDrawer`: detail panel for concrete memory/session/prompt records.
- `useGlobalSearch`: debounced API calls, cancellation, loading/error state, and result normalization.

The existing `Header` should only own the open/close trigger. Search state should live inside the palette so the feed remains simple.

## Keyboard and Interaction

- `Cmd/Ctrl+K` opens the search palette.
- `Escape` closes the palette, or closes the detail drawer first if it is open.
- `Enter` opens the highlighted result when keyboard navigation is present.
- Arrow-key navigation is desirable, but can be a second pass if implementation risk grows.
- Clicking outside the palette closes it unless a detail drawer is open.

## Empty, Loading, and Error States

- Empty input: show a quiet prompt such as recent or suggested search categories only if existing data is cheap to obtain; otherwise show no results.
- Loading: show a compact inline loading row under the input.
- No results: show a single empty row with the current query.
- Error: show a recoverable message and a retry action. Do not close the palette.
- Stale responses from older queries must be ignored.

## Testing

Add focused frontend tests where the existing test setup supports them. At minimum, verify:

- The header opens the command palette.
- Query + type dropdown produce the correct API request shape.
- JSON search responses normalize into mixed result rows with type labels.
- Clicking Memory/Session/Prompt opens the detail flow.
- Clicking File/Concept replaces the query and reruns search.
- Empty, loading, and error states render without breaking the feed.

Run the existing viewer typecheck after implementation:

```bash
npm run typecheck:viewer
```

If implementation touches shared routes or search response contracts, also run the relevant worker/search tests.

## Open Implementation Notes

- The current visual brainstorming artifacts are under `.superpowers/` and should not be committed as product source.
- Consider adding `.superpowers/` to `.gitignore` in a separate housekeeping change.
- If backend JSON does not expose enough metadata for first-class File/Concept rows, derive them on the frontend first rather than adding new endpoints prematurely.
