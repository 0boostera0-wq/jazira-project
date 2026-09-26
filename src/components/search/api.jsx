"use client";

import { createContext, useContext } from "react";
import { createSearcher, searchAll } from "@/lib/data/search";

// The remote search API the page talks to (search_all via src/lib/data/search.js).
// A provider can swap it — used by visual QA to render signed-in / populated
// states without a database. Production code never overrides it.
// searchAll pages one group of a result tab ("show more": p_types + p_offset).
const SearchApiContext = createContext({ createSearcher, searchAll });

export function SearchApiOverride({ api, children }) {
  return <SearchApiContext.Provider value={api}>{children}</SearchApiContext.Provider>;
}

export const useSearchApi = () => useContext(SearchApiContext);
