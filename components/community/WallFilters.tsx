"use client";

import { useState } from "react";

type Option = { id: string; name: string };

export default function WallFilters({
  query,
  sort,
  schoolId,
  categoryId,
  schools,
  categories,
}: {
  query: string;
  sort: string;
  schoolId?: string;
  categoryId?: string;
  schools: Option[];
  categories: Option[];
}) {
  const activeFilterCount = Number(sort !== "latest") + Number(Boolean(schoolId)) + Number(Boolean(categoryId));
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);

  return (
    <form className="wall-filters card" action="/wall">
      <div className="wall-search-row">
        <label className="sr-only" htmlFor="wall-search">Search posts</label>
        <input
          id="wall-search"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={80}
          className="input wall-search-input"
          placeholder="Search posts..."
        />
        <button className="btn-primary wall-search-submit" type="submit">Search</button>
        <button
          className={`wall-filter-toggle${filtersOpen ? " wall-filter-toggle-active" : ""}`}
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="wall-filter-options"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
            <circle cx="15" cy="7" r="2" />
            <circle cx="9" cy="17" r="2" />
          </svg>
          <span>Filters</span>
          {activeFilterCount > 0 && <span className="wall-filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      <div id="wall-filter-options" className="wall-filter-options" hidden={!filtersOpen}>
        <label className="text-sm">
          Sort by
          <select name="sort" defaultValue={sort} className="input mt-1">
            <option value="latest">Latest</option>
            <option value="popular">Popular</option>
            <option value="discussed">Most discussed</option>
          </select>
        </label>
        <label className="text-sm">
          School
          <select name="school" defaultValue={schoolId ?? ""} className="input mt-1">
            <option value="">All schools</option>
            {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Category
          <select name="category" defaultValue={categoryId ?? ""} className="input mt-1">
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <button className="btn-ghost wall-filter-apply" type="submit">Apply filters</button>
      </div>
    </form>
  );
}
