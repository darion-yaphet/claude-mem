# Global Search Command Palette Verification

Manual interaction checklist for the global search command palette. This repository currently has normalization coverage but no React DOM interaction harness for these flows.

- [ ] Header Search opens the command palette.
- [ ] Cmd+K on macOS or Ctrl+K on Windows/Linux opens the command palette.
- [ ] Selecting a File or Concept result replaces the query text and resets the type filter to All.
- [ ] Selecting a Memory, Session, or Prompt result opens the detail drawer.
- [ ] Escape closes an open detail drawer first, then closes the palette on the next press.
- [ ] Focus is trapped inside the palette while open and restored to the prior element when closed.
- [ ] Clicking the backdrop closes the palette when no detail drawer is open.
- [ ] Clicking the backdrop does not close the palette while a detail drawer is open or loading.
- [ ] Selecting a loaded Memory, Session, or Prompt highlights the corresponding feed item.
- [ ] Selecting an off-feed Memory, Session, or Prompt keeps the opened detail drawer detail-only.
- [ ] Selecting the same result again re-applies the feed highlight.
- [ ] Closing the palette before the requestAnimationFrame focus callback does not leave a stale highlight.
