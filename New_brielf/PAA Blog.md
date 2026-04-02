Blog Topic Ideation — PAA & Related Searches Collection Guide
Purpose
This prompt instructs the AI to collect raw topic ideas from Google SERP features (People Also Ask and Related Searches) using the DFS SERP API. The output is a pool of real search queries that feed into the Blog Topic Ideation system prompt for final blog idea generation.
This is Phase 1 (data collection). The Blog Topic Ideation system prompt is Phase 2 (idea generation from collected data + domain knowledge).

How Thai Google SERP Features Work
Understanding which keywords trigger which SERP features is critical to seed selection. Not all keywords return PAA in Thai SERPs.
PAA triggers (tested and confirmed)
Only two types of Thai keywords reliably trigger PAA:
Keyword type
Example
PAA?
Related Searches?
คือ (what is) variants
โซล่าเซลล์ คือ
✅ 4 PAA
✅ 8
Short question-format keywords (2–3 words, root + intent modifier)
โซล่าเซลล์ ราคา, โซล่าเซลล์ คุ้มไหม
✅ 4 PAA
✅ 8
English technical terms in Thai SERP (varies)
solar inverter
✅ 4 PAA
✅ 8

Keywords that do NOT trigger PAA
Keyword type
Example
PAA?
Related Searches?
Bare head terms (1–2 words, no modifier)
โซล่าเซลล์
❌ 0
✅ 8
Mid-tail transactional (verb + product)
ติดตั้งโซล่าเซลล์, ติดโซล่า
❌ 0
✅ 8
Long natural-language questions (3+ words with evaluative modifier)
ติดโซล่าเซลล์ เจ้าไหนดี
❌ 0
✅ 8
Company-type keywords
บริษัทติดตั้งโซล่าเซลล์
❌ 0
✅ 8 (company-focused)

Key insight: zero overlap between seed types
A bare head term and its "คือ" variant return completely non-overlapping Related Searches. The bare term yields commercial/price queries while "คือ" yields educational/concept queries. Short question formats like "ราคา" return yet another distinct set. This makes them complementary seeds, not redundant ones.

Phase 1 — Seed Keyword Selection
Before making any API calls, analyze the business context and keyword map to select two sets of seed keywords.
1A. Thai Seeds (10 keywords)
Select 10 Thai-language seed keywords. These pull Related Searches and (for qualifying types) PAA data from the Thai Google SERP.
The 6 seed keyword categories
Category 1 — Core root keywords (1–2 seeds)
Short, unmodified root keywords representing the business's primary product/service.
Example: โซล่าเซลล์, อินเวอร์เตอร์
Returns: 8 Related Searches spanning price, brand, product type, and adjacent topics. No PAA.
Value: Widest variety of Related Searches. Good for discovering what commercial/product subtopics people explore around the main keyword.
Use for: The 1–2 most important root keywords only.
Category 2 — Mid-tail transactional keywords (2–3 seeds)
Verb + product combinations or commercial-intent phrases, 2–3 words.
Example: ติดตั้งโซล่าเซลล์, ราคาแผงโซล่าเซลล์, สินเชื่อโซล่าเซลล์
Returns: 8 Related Searches that are highly specific and blog-ready — topics like kW-specific pricing, tax deductions, utility permits, financing. No PAA.
Value: The most actionable Related Searches for blog content. Each result is practically a ready-made blog title.
Rule: Each seed must use a different verb/modifier. ติดตั้งโซล่าเซลล์ and ติดโซล่า return near-identical results — pick one, not both.
Category 3 — Niche modifier keywords (0–2 seeds, only if strategically relevant)
Root keyword + specific niche/audience segment, 2–3 words.
Example: โซล่าเซลล์ โรงงาน, โซล่าเซลล์ คอนโด, โซล่าเซลล์ เกษตร
Returns: 8 niche-specific Related Searches. No PAA (likely).
Value: Surfaces niche-specific blog ideas that broader seeds miss. Only use if the business specifically targets that niche.
Warning: Long-tail niche modifiers (3+ words, e.g., ติดตั้งโซล่าเซลล์ โรงงาน) overlap heavily with their parent mid-tail keyword. Keep to 2 words maximum.
Category 4 — คือ (what is) variants (2–3 seeds)
Important concept + คือ. Use for concepts where you want educational/definitional blog ideas.
Example: โซล่าเซลล์ คือ, PPA คือ, net metering คือ, BESS คือ
Returns: 4 PAA questions + 8 Related Searches. Both are completely different from the bare head term — zero overlap confirmed.
Value: PAA gold mine for Thai seeds. Related Searches surface educational topics: how things work, pros/cons, components, types, benefits.
Best practice: If you already have a bare head term as a Category 1 seed, using its "คือ" variant doubles your harvest from that topic because results don't overlap. But if seed slots are limited, prefer "คือ" for secondary concepts (PPA คือ, BESS คือ) that aren't covered by any other seed.
Category 5 — Short question-format keywords (2–3 seeds)
Root keyword + a short question/intent modifier that people naturally search. Keep to 2–3 words maximum.
Example: โซล่าเซลล์ ราคา, โซล่าเซลล์ คุ้มไหม, โซล่าเซลล์ ข้อเสีย
Returns: 4 PAA questions + 8 Related Searches. PAA questions tend to be very specific (e.g., price-by-kW queries).
Value: Second PAA trigger alongside "คือ" variants. PAA questions from this category tend to be more transactional/specific than the educational ones from "คือ" variants.
Rule: Each seed must use a different intent modifier. โซล่าเซลล์ ราคา and ราคาโซล่าเซลล์ are the same intent — pick one.
What does NOT work as Category 5: Long natural-language questions like ติดโซล่าเซลล์ เจ้าไหนดี do NOT trigger PAA. These behave like company-type keywords and return company/brand-focused Related Searches. Avoid these — they waste a seed slot that could go to a PAA-triggering seed.
Category 6 — Other root keywords (1–2 seeds)
Alternative root terms, synonyms, adjacent pillars, or English terms used in Thai context.
Example: พลังงานแสงอาทิตย์, solar rooftop, solar inverter, โซล่าฟาร์ม
Returns: 8 Related Searches from a different topic cluster. PAA varies — English technical terms in Thai SERP can trigger PAA (confirmed: solar inverter returned 4 PAA).
Value: Ensures you don't cluster all ideas under one root keyword. English technical terms are especially valuable because they may trigger PAA as a bonus.
Recommended distribution for 10 Thai seeds
Category
Count
PAA?
Related Searches?
Primary purpose
1. Core root
1–2
❌ No
✅ 8 (broad commercial)
Wide topic discovery
2. Mid-tail transactional
2–3
❌ No
✅ 8 (specific, blog-ready)
Actionable blog titles
3. Niche modifier
0–2
❌ Unlikely
✅ 8 (niche-specific)
Niche coverage (if needed)
4. คือ variant
2–3
✅ 4 PAA
✅ 8 (educational)
PAA harvest + educational topics
5. Question format
2–3
✅ 4 PAA
✅ 8 (intent-specific)
PAA harvest + transactional topics
6. Other root
1–2
❓ Maybe (English terms often yes)
✅ 8 (different cluster)
Pillar breadth

PAA optimization note: To maximize PAA harvest, prioritize Categories 4, 5, and English terms in Category 6. With 2–3 seeds in Categories 4 and 5, plus 1–2 English terms in Category 6 that may trigger PAA, you can expect 16–28 Thai PAA questions total.
Seeds to avoid
❌ Long-tail keywords with 3+ words (e.g., ติดตั้งโซล่าเซลล์ โรงงาน) — Related Searches overlap heavily with the mid-tail parent.
❌ Branded keywords (the business's own name) — return navigational results, not blog ideas.
❌ Company-type keywords (e.g., บริษัทติดตั้งโซล่าเซลล์) — Related Searches are all company/location/stock-market focused.
❌ Synonym seeds (e.g., both ติดตั้งโซล่าเซลล์ and ติดโซล่า) — near-identical results, wastes a seed slot.
❌ Long natural-language questions (e.g., ติดโซล่าเซลล์ เจ้าไหนดี) — do not trigger PAA despite looking like questions. Return company-focused Related Searches.
Additional selection criteria
Cover the full breadth of the business's offerings — do not cluster all seeds under one pillar.
Prefer keywords with known search volume over zero-volume terms.
Each seed should be topically distinct from the others.
1B. English Seeds (10 keywords)
Select 10 English-language seed keywords to pull additional PAA data. English SERPs return PAA more reliably and for a wider range of queries.
Selection rules
Use the English equivalents of the business's core Thai topics.
Include a mix of: head terms, question phrases, comparison phrases, and concept terms.
Set location to Thailand and language to English — this returns PAA data relevant to the Thai market but in English (which will be translated to Thai in Phase 3).
English seeds are primarily for PAA harvest. Related Searches from English seeds are less useful (they're in English and may not reflect Thai search behavior).

Phase 2 — SERP Data Collection
Critical: Post-call extraction protocol
The DFS SERP API returns massive payloads including AI Overviews, organic results, video carousels, and image packs — none of which we need. To avoid wasting context on irrelevant data, follow this extraction protocol after every API call:
Immediately after receiving results from each API call, extract ONLY:
All items where type = "related_searches" → collect the items array (list of query strings)
All items where type = "people_also_ask" → for each item in the items array, extract the title field only
Discard everything else — organic results, AI overviews, videos, images, shopping results, etc. Do not reference, summarize, or analyze them.
Append extracted data to running master lists:
PAA Master List: append PAA titles (note whether Thai or English, and which seed triggered them)
Related Searches Master List: append related search query strings (note which seed triggered them)
Then proceed to the next API call. Do not wait until all calls are complete to start extraction.
2A. Thai Seeds → Related Searches + PAA
For each of the 10 Thai seed keywords, call serp_organic_live_advanced with:
keyword: the Thai seed keyword
location_name: "Thailand"
language_code: "th"
device: "desktop"
depth: 10
people_also_ask_click_depth: 4
Expected behavior by seed category:
Seed category
PAA expected
Related Searches expected
1. Core root (โซล่าเซลล์)
0
8
2. Mid-tail transactional (ติดตั้งโซล่าเซลล์)
0
8
3. Niche modifier (โซล่าเซลล์ โรงงาน)
0 (likely)
8
4. คือ variant (โซล่าเซลล์ คือ)
4
8
5. Question format (โซล่าเซลล์ ราคา)
4
8
6. Other root / English terms (solar inverter)
0–4 (English terms often trigger PAA)
8

If a Category 4 or 5 seed returns 0 PAA, note it — this is unusual and may indicate the keyword is too niche or phrased too long. Consider rephrasing to a shorter form.
2B. English Seeds → PAA (supplement)
For each of the 10 English seed keywords, call serp_organic_live_advanced with:
keyword: the English seed keyword
location_name: "Thailand"
language_code: "en"
device: "desktop"
depth: 10
people_also_ask_click_depth: 4
Apply the same extraction protocol: immediately extract only PAA titles and Related Search items, discard everything else.

Phase 3 — Translation & Normalization
3A. Translate English PAA results to Thai
Translate all English PAA questions into natural Thai phrasing. These should read as if a Thai user typed them into Google. Do not translate literally — adapt to how Thai users would actually phrase the question.
3B. Normalize all collected data
Fix DFS spacing artifacts: The DFS API consistently returns Thai keywords with broken spacing (e.g., โซ ล่า เซลล์ instead of โซล่าเซลล์, ติด ตั้ง โซ ล่า เซลล์ instead of ติดตั้งโซล่าเซลล์, อิน เวอร์ เตอร์ instead of อินเวอร์เตอร์). This was observed in every single test query. Always rejoin these into natural Thai spelling before using them. This applies to both Related Searches and Thai PAA results.
Remove noise:
Remove navigational results (someone searching for a specific brand's website URL)
Remove results clearly off-topic or unrelated to the business's industry
Remove company-type results that are just company listings (e.g., บริษัทโซล่าเซลล์ มหาชน)
Trim duplicates:
โซล่าเซลล์ราคา and ราคาโซล่าเซลล์ are the same intent — keep the more natural one
Translated English PAA questions that match Thai PAA questions already collected — keep one

Phase 4 — Programmatic Pattern Detection
Scan the combined PAA + Related Searches lists for programmatic patterns — queries that share a template but swap one variable.
Common patterns to look for
kW variations: ติดตั้งโซล่าเซลล์ 3kW ราคา, ติดตั้งโซล่าเซลล์ 5kW ราคา, ติดตั้งโซล่าเซลล์ 10kW ราคา → Template: ติดตั้งโซล่าเซลล์ [kW] ราคา with variables 3kW, 5kW, 10kW
Location variations: Same query with different provinces or cities
Year variations: ราคาโซล่าเซลล์ 2567, ราคาโซล่าเซลล์ 2568
Brand/competitor variations: Same comparison format with different company names
Product type variations: Same question with different product categories
Collapsing rules
If 3+ queries share the same template with only one variable changing, collapse them into a single programmatic entry.
The Blog Title should use brackets for the variable: ติดตั้งโซล่าเซลล์ [kW] ราคาเท่าไหร่
List all variable values comma-separated in the Programmatic Variables column.
Each collapsed programmatic entry counts as one row in the final output but generates multiple pages.

Phase 5 — Deduplication & Cannibalization Check
Internal deduplication
Compare all remaining entries against each other. If two entries target the same search intent (even with different wording), keep only the one with the more natural or higher-volume phrasing.
Cannibalization check against keyword map
Cross-check every blog idea against all keyword group names, pillar names, and Level 3 keywords in the provided keyword map. Remove or rephrase any idea that duplicates an existing keyword to avoid cannibalization.

Phase 6 — Final Output
Combine the deduplicated PAA and Related Searches results into the final blog ideas list. For each entry, produce 4 columns:
Column
Description
Blog Title
The H1 headline, written in Thai. For programmatic entries, use [variable] brackets.
Source
Either "PAA" or "Related Search" — indicates where this idea came from.
Source Seed
The seed keyword that triggered this result.
Programmatic Variables
Only for programmatic entries. Comma-separated list of all variable values. Blank for non-programmatic entries.

Output requirements
Every Blog Title must be in Thai.
Every row must have all columns filled (Programmatic Variables blank where not applicable).
Minimum 100 blog ideas.
Source balance between PAA and Related Searches should be roughly even.

Execution Checklist
Before producing final output, verify:
All 20 API calls (10 Thai + 10 English) were executed.
Post-call extraction was applied to every call — only PAA titles and Related Search items were retained.
Thai seed mix follows the 6-category distribution: 1–2 core root, 2–3 mid-tail transactional, 0–2 niche modifier, 2–3 คือ variants, 2–3 question formats, 1–2 other root seeds.
PAA was expected from Categories 4 and 5 only — Categories 1, 2, and 3 should not be expected to return PAA. Category 6 English terms may return PAA as a bonus.
English PAA results were translated into natural Thai.
DFS spacing artifacts in Thai results were fixed (e.g., โซ ล่า เซลล์ → โซล่าเซลล์). This affects EVERY Thai result.
Programmatic patterns were detected and collapsed.
Internal deduplication was performed — no two entries target the same intent.
Cannibalization check against the keyword map was performed.
Every Blog Title is in Thai.
Every row has all required columns filled.
Minimum 100 blog ideas are present.
Source balance between PAA and Related Searches is roughly even.

Appendix A: Test Results Summary
Actual DFS SERP API results from testing the Thai solar industry (2026-04-01). Use this to validate future tests or adjust the framework for other industries.
Test 1: โซล่าเซลล์ (Category 1 — Core root)
PAA: 0
Related Searches (8): โซล่าเซลล์ 5000W ราคา · โซล่าเซลล์บ้าน ราคา · โซล่าเซลล์ ยี่ห้อไหนดี · โซล่าเซลล์ ราคา · ไฟโซล่าเซลล์ ในบ้าน · โซล่าเซลล์ ภาษาอังกฤษ · โซล่าเซลล์ พกพา · โซล่าเซลล์ แบตเตอรี่
Theme: Commercial/product — price, brand, product type, portable, battery
Test 2: ติดตั้งโซล่าเซลล์ (Category 2 — Mid-tail transactional)
PAA: 0
Related Searches (8): ติดตั้งโซล่าเซลล์ 3kW ราคา · ติดตั้งโซล่าเซลล์ราคา · ติดตั้งโซล่าเซลล์ใช้ในบ้าน · ราคาติดตั้งโซล่าเซลล์บ้าน · ติดตั้งโซล่าเซลล์ 5kW ราคา · ติดตั้งโซล่าเซลล์ การไฟฟ้า · ติดตั้งโซล่าเซลล์ ลดหย่อนภาษี · ติดตั้งโซล่าเซลล์ 10kW ราคา
Theme: Highly specific & blog-ready — kW pricing (programmatic!), tax deduction, utility permits
Test 3: โซล่าเซลล์ คือ (Category 4 — คือ variant)
PAA (4): โซล่าเซลล์มีหน้าที่ทำอะไร · ติดตั้งโซล่าเซลล์ 50 kW ราคาเท่าไร · โซล่า หมายถึงอะไร? · ไฟจากโซล่าเซลล์ เป็นไฟอะไร
Related Searches (8): โซล่าเซลล์ คืออะไร และมีหลักการทำงานอย่างไร · พลังงานโซล่าเซลล์ คืออะไร · โซล่าเซลล์ หลักการทำงาน · แผงโซล่าเซลล์ คืออะไร · โซล่าเซลล์ ผลิตไฟฟ้าได้อย่างไร · โซล่าเซลล์ มีกี่ประเภท · โซล่าเซลล์ ข้อดี ข้อเสีย · โซล่าเซลล์ ประโยชน์
Theme: Educational/concept — how it works, types, pros/cons, benefits
Overlap with Test 1: ZERO overlap in Related Searches confirmed
Test 4: โซล่าเซลล์ ราคา (Category 5 — Question format)
PAA (4): ติดตั้งโซล่าเซลล์ 100 kW ราคาเท่าไร · ติดตั้งโซล่าเซลล์ 200 kW ราคาเท่าไร · ค่าแรงติดตั้งโซลาร์เซลล์ 5kW ราคาเท่าไหร่? · ติดตั้งโซล่าเซลล์ 20kW ราคาเท่าไร
Related Searches (8): ราคาแผงโซล่าเซลล์สำหรับบ้าน · โซล่าเซลล์ 5000W ราคาถูก · โซล่าเซลล์ 3kW ราคา · โซล่าเซลล์ 10000W ราคา · ติดโซล่าเซลล์ราคา 2568 · ติดโซล่าเซลล์บ้าน ราคา Pantip · โซล่าเซลล์ 1000W ราคา · ติดตั้งโซล่าเซลล์ราคา
Theme: Price-by-kW (programmatic pattern!), year-specific pricing, Pantip reviews
Note: PAA questions are price-by-kW queries — excellent programmatic blog candidates
Test 5: solar inverter (Category 6 — English term in Thai SERP)
PAA (4): Solar Inverter คือ · Solar Inverter ยี่ห้อไหนดี · Huawei solar inverter ราคาเท่าไหร่? · Solar Inverter มีกี่แบบ
Related Searches (8): Solar inverter hybrid · Solar inverter Huawei · Solar Inverter Pump · Solar Inverter Charger · Inverter โซล่าเซลล์ · อินเวอร์เตอร์โซล่าเซลล์ 3000W · Inverter Solar cell ยี่ห้อไหนดี Pantip · Inverter Deye
Theme: Product types, brand comparison, wattage-specific, Pantip reviews
Key finding: English technical terms in Thai SERP CAN trigger PAA. Category 6 is more valuable than initially assumed.
Test 6: ติดโซล่าเซลล์ เจ้าไหนดี (tested as Category 5 — FAILED)
PAA: 0 ❌
Related Searches (8): A Solar ดีไหม Pantip · ติดตั้งโซลาเซลล์ บริษัทไหนดี Pantip · บริษัทติดตั้งโซล่าเซลล์บ้าน · โซล่าเซลล์ ยี่ห้อไหนดี Pantip · บริษัทโซล่าเซลล์ ในไทย · โซล่าเซลล์ ยี่ห้อไหนดี Pantip 2567 · บริษัทโซล่าเซลล์ มหาชน · SCG Solar Roof ราคา
Theme: Company/brand-focused — Pantip reviews, company lists, brand recommendations, stock-market
Key finding: Long natural-language questions with evaluative modifiers (เจ้าไหนดี) do NOT trigger PAA. They behave like company-type keywords. Add to "seeds to avoid" list.
Test 7: ติดโซล่า (Category 2 — Mid-tail transactional, short verb form)
PAA: 0
Related Searches (8): ติดโซล่าเซลล์ 3kW ราคา · ติดโซล่าเซลล์ราคา · ติดโซล่าเซลล์ 5kW ราคา · ติดโซล่าเซลล์ ใช้ในบ้าน · ติดโซล่าเซลล์ บ้าน ต้องขออนุญาตไหม · ติดโซล่าเซลล์ คุ้มไหม · ติดโซล่าเซลล์ใช้กับแอร์ · ติดโซล่าเซลล์ ลดหย่อนภาษี
Theme: Very blog-ready — kW pricing, home use, permits, ROI, AC use case, tax deduction
Key finding: Overlaps significantly with ติดตั้งโซล่าเซลล์ (Test 2). Unique additions: "ใช้กับแอร์" and "คุ้มไหม". Confirms synonym seeds waste slots — pick one, not both.