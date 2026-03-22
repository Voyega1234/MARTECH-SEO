🗺️ SEO Keyword Sitemap Planning Guideline

1. The Core Philosophy
The Sitemap is the final bridge between Topic Research and Site Architecture. It takes the Keyword Groups defined in the Topical Authority Framework and assigns them to a specific site hierarchy while incorporating essential business pages critical for conversion.
Logic: 1 Keyword Group = 1 URL = 1 Unique Sitemap Entry.
Goal: A comprehensive sitemap structure that dictates exactly where every keyword "lives" on the website.

2. Input Requirements
To generate an accurate sitemap, the following inputs are required:
Keyword Map/Audit: The output from the previous steps (Product Line, Pillar, Groups, Slugs, Keywords, Search Volume, and Current Position if available).
Business Context: A description of the business model, main conversion goals, and current customer journey.

3. Workflow: Building the Sitemap
Analyze and Group Keywords: Cluster keywords based on intent and semantic relevance.
Define Page Structure: Determine the page type (Homepage, Category, Service Page, Blog, Tool, or Supporting Page).
Recommend Supporting Pages: Add pages like 'About Us', 'FAQ', or 'Contact Us' to build trust.
Map Keywords to Pages: Assign Primary (Keyword Group) and Supporting (Keywords) terms to each URL.
Prioritization Scoring: Assign Conversion and Traffic potential (Low, Medium, High).

4. Execution Instructions (AI Prompt)
Act as an Expert SEO Specialist and Keyword Architect. Your task is to plan the site structure and content strategy for my website.

Input Variables:
Business Context: [Describe business model, e.g., 'Solar Aggregator driving leads'].
Keyword List: [Paste Keyword Map/Audit data including volumes and positions].

Instructions:
Analyze and Group Keywords: Group the keywords into logical topics based on user intent and semantic relevance.
Define Page Structure: For each group, determine the most appropriate page type (Homepage, Category, Service Page, Blog, Tool, or Supporting Page).
Suggest Page Details: Propose a clear Page Title and an SEO-friendly Slug and path.
Recommend Supporting Pages: Incorporate crucial pages for UX and trust (About Us, FAQ, Case Studies).
Map Keywords to Pages: Assign all relevant supporting keywords (Level 3).
Format Rule: Use Keyword, Volume, Position.
Conditional Note: If Current Position is not provided in the input source, remove it and provide only Keyword, Volume.
Identify Main Keyword Group: Identify exactly one primary keyword for the cluster.
Prioritization: Assign Low, Medium, or High for Conversion and Traffic potential (based on the highest volume keyword in the group).
Output Requirement: Your FINAL output must be ONLY a valid JSON object — no markdown, no tables, no prose, no explanations, no code fences, no ```json``` blocks. Do not output anything before or after the JSON. The response must start with { and end with }.

Output JSON Schema:
{
  "sections": [
    {
      "section": "string",
      "sub_section_or_category": "string",
      "page_title": "string",
      "slug_and_path": "string",
      "keywords": [
        {
          "keyword": "string",
          "volume": 0,
          "position": 0
        }
      ],
      "keyword_group": "string",
      "conversion_potential": "Low | Medium | High",
      "traffic_potential": "Low | Medium | High"
    }
  ]
}

Rule for keywords field:
- If current position exists, include: { "keyword": "...", "volume": 0, "position": 0 }
- If current position does not exist, include: { "keyword": "...", "volume": 0 }
- Do not invent position data.

5. Gold Standard Full Example (JSON format):
{
  "sections": [
    {
      "section": "Home",
      "sub_section_or_category": "",
      "page_title": "SolarTH: รวมบริษัทติดตั้งโซล่าเซลล์ อันดับ 1 ในไทย",
      "slug_and_path": "/",
      "keywords": [
        { "keyword": "ติดโซล่าเซลล์", "volume": 5400, "position": 2 },
        { "keyword": "ติดตั้งโซล่าเซลล์", "volume": 4400, "position": 5 },
        { "keyword": "รับติดตั้งโซล่าเซลล์", "volume": 1300, "position": 0 }
      ],
      "keyword_group": "ติดโซล่าเซลล์",
      "conversion_potential": "High",
      "traffic_potential": "High"
    },
    {
      "section": "Services",
      "sub_section_or_category": "Residential",
      "page_title": "Residential Solar Panel Installation Thailand",
      "slug_and_path": "/services/residential-solar-installation",
      "keywords": [
        { "keyword": "ติดโซล่าเซลล์ บ้าน", "volume": 2400, "position": 11 },
        { "keyword": "โซล่าเซลล์บ้าน", "volume": 1900, "position": 18 },
        { "keyword": "ติดโซลาร์เซลล์ที่บ้าน", "volume": 880, "position": 0 }
      ],
      "keyword_group": "ติดโซล่าเซลล์ บ้าน",
      "conversion_potential": "High",
      "traffic_potential": "High"
    },
    {
      "section": "Pricing",
      "sub_section_or_category": "General Cost",
      "page_title": "Solar Panel Installation Cost & Pricing Thailand",
      "slug_and_path": "/pricing/solar-installation-cost",
      "keywords": [
        { "keyword": "ราคาติดตั้งโซล่าเซลล์", "volume": 6600 },
        { "keyword": "ติดโซล่าเซลล์ ราคา", "volume": 5400 },
        { "keyword": "ค่าติดตั้ง solar cell", "volume": 1300 }
      ],
      "keyword_group": "ราคาติดตั้งโซล่าเซลล์",
      "conversion_potential": "Medium",
      "traffic_potential": "High"
    },
    {
      "section": "Blog",
      "sub_section_or_category": "Guides",
      "page_title": "What are Solar Cells and How Do They Work?",
      "slug_and_path": "/blog/what-is-solar-cell",
      "keywords": [
        { "keyword": "โซล่าเซลล์คืออะไร", "volume": 4400 },
        { "keyword": "เซลล์สุริยะคืออะไร", "volume": 1300 },
        { "keyword": "หลักการทำงานของ solar cell", "volume": 880 }
      ],
      "keyword_group": "โซล่าเซลล์คืออะไร",
      "conversion_potential": "Low",
      "traffic_potential": "High"
    }
  ]
}

6. Optimization Rules
Data Integrity: Preserve both Volume and Position data where available.
Fallback Rule: If Current Position is not provided in the input, omit it from the keywords field for those specific entries.
No Duplication: Every keyword group must map to only one slug.
Path Logic: Use logical nesting (e.g., /services/category/topic).
Conversion Focus: High-conversion groups must be in transactional sections (Services/Pricing).