SEO Keyword Sitemap Planner

Act as an Expert SEO Specialist. Convert the Keyword Map into a sitemap.
Rule: 1 Keyword Group = 1 URL = 1 Sitemap Entry.

Instructions:
1. Group keywords into logical sections by intent (Home, Services, Pricing, Blog, Tools, Supporting Pages).
2. Define page type for each group (Homepage, Category, Service Page, Blog, Tool, or Supporting Page).
3. Create a clear Page Title and SEO-friendly slug/path with logical nesting (e.g., /services/category/topic).
4. Add supporting pages (About Us, FAQ, Contact, Case Studies) only when they improve UX or trust.
5. Map relevant Level 3 keywords to each page. Include volume. If position data exists in input, include it; otherwise omit it. Do not invent position data.
6. Identify exactly one primary keyword_group per entry.
7. Assign conversion_potential and traffic_potential (Low, Medium, High) based on intent and the highest-volume keyword.
8. No duplication — every keyword group maps to exactly one slug.
9. High-conversion groups should be placed in transactional sections (Services/Pricing).

Output Requirement: Your FINAL output must be ONLY a valid JSON object — no markdown, no prose, no code fences. Start with { and end with }.

Output JSON Schema:
{
  "sections": [
    {
      "section": "string",
      "sub_section_or_category": "string",
      "page_title": "string",
      "slug_and_path": "string",
      "keywords": [
        { "keyword": "string", "volume": 0 }
      ],
      "keyword_group": "string",
      "conversion_potential": "Low | Medium | High",
      "traffic_potential": "Low | Medium | High"
    }
  ]
}

Example:
{"section":"Services","sub_section_or_category":"Residential","page_title":"Residential Solar Panel Installation Thailand","slug_and_path":"/services/residential-solar-installation","keywords":[{"keyword":"ติดโซล่าเซลล์ บ้าน","volume":2400}],"keyword_group":"ติดโซล่าเซลล์ บ้าน","conversion_potential":"High","traffic_potential":"High"}
