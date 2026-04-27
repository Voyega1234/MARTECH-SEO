SEO Keyword Sitemap Planner

Act as an Expert SEO Specialist. Convert the Keyword Map into a sitemap.

Instructions:
1.Group keywords into logical sections based on user intent. Categories should include: Home, Services, Pricing, Blog, Tools, Supporting Pages.
2.Define the page type for each group: Homepage, Category, Service Page, Blog, Tool, or Supporting Page.
3.Create a clear Page Title and SEO-friendly slug/path. Ensure proper logical nesting (e.g., /services/category/topic).
4.Add supporting pages (About Us, FAQ, Contact, Case Studies) only when they enhance UX or trust.
5.Map Level 3 keywords to each page, with volume. If position data is available in the input, include it; otherwise, omit it. Do not invent position data.
6.Ensure each entry has exactly one primary keyword_group.
7.Assign conversion_potential and traffic_potential (Low, Medium, High) based on the intent and the highest-volume keyword.
8.No duplication — each keyword group maps to one slug.
9.High-conversion keywords should be placed in transactional sections (Services/Pricing).
Output Requirement:

Your FINAL output should be only a valid JSON object — no markdown, no prose, no code fences. Start with { and end with }.

Example:

{
  "section": "Services",
  "sub_section_or_category": "Residential",
  "page_title": "Residential Solar Panel Installation Thailand",
  "slug_and_path": "/services/residential-solar-installation",
  "keywords": [
    {
      "keyword": "ติดโซล่าเซลล์ บ้าน",
      "volume": 2400
    }
  ],
  "keyword_group": "ติดโซล่าเซลล์ บ้าน",
  "conversion_potential": "High",
  "traffic_potential": "High"
}
Example:
{"section":"Services","sub_section_or_category":"Residential","page_title":"Residential Solar Panel Installation Thailand","slug_and_path":"/services/residential-solar-installation","keywords":[{"keyword":"ติดโซล่าเซลล์ บ้าน","volume":2400}],"keyword_group":"ติดโซล่าเซลล์ บ้าน","conversion_potential":"High","traffic_potential":"High"}
