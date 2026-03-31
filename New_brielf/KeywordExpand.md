Step 2 — Keyword Expansion Prompt

PROMPT
You are given a business context, a list of seed keywords, and a list of competitor domains. Your job is to pull keywords from two sources — seed expansion and competitor rankings — then combine everything into one clean, deduplicated list.

Step 1 — Seed keyword expansion
For each seed keyword in the list provided, paginate through the full result set using dataforseo_labs_google_keyword_suggestions with the following parameters:
keyword: the seed keyword
location_name: as specified in the business context
language_code: the market language code as specified in the business context (e.g. "th" for Thailand — use this for ALL seeds regardless of whether the seed word is in Thai or English)
limit: 500
offset: start at 0, then increment by 500 each call (0, 500, 1000, …)
order_by: ["keyword_info.search_volume,desc"]
Keep paginating until a call returns fewer than 500 results — that signals the end of the result set for that seed. Run all seeds to full exhaustion. Do not skip any seed.
Important — language_code is the market, not the script of the seed word. Thai searchers also search in English. A seed like solar cell or botox should still be run with language_code: "th" when the target market is Thailand — this queries the Thai market's search index and returns all queries containing that word regardless of script. Running solar cell with language_code: "th" and โซล่าเซลล์ with language_code: "th" returns two completely different, non-overlapping keyword sets — both are needed and neither duplicates the other.
From each result extract:
keyword
keyword_info.search_volume — use the value as-is. If the value is null or missing, record it as -.

Step 2 — Competitor keyword scraping
For each competitor domain provided, call dataforseo_labs_google_ranked_keywords with the following parameters:
target: the competitor domain (without https:// or www.)
location_name: as specified in the business context
language_code: the market language code as specified in the business context
item_types: ["organic"]
limit: 200
order_by: ["keyword_data.keyword_info.search_volume,desc"]
Run all competitor domains. Do not skip any.
From each result extract:
keyword_data.keyword
keyword_data.keyword_info.search_volume — use the value as-is. If the value is null or missing, record it as -.

Step 3 — Combine and deduplicate
Combine all keywords from Step 1 and Step 2 into a single pool.
Deduplicate: treat any two keyword strings that are identical after removing all spaces as the same keyword (e.g. ติดตั้ง โซล่าเซลล์ and ติดตั้งโซล่าเซลล์ are the same). Keep only one entry — prefer the form with the higher search volume, or either form if volumes are equal.
When the same keyword appears more than once with different volume values, keep the highest numeric value. If all instances are -, keep -.
Sort the final list by search volume descending. Treat - as 0 for sorting purposes.

Step 4 — Output
Output the full combined list in this exact format — one keyword per line, no headers:
keyword,search_volume
โซล่าเซลล์,40500
แผงโซล่าเซลล์,27100
solar cell,9900
ติดตั้งโซล่าเซลล์,2900
ติดตั้ง solar cell,590
โซล่าเซลล์ facebook,-
...
Output the complete list as a CSV file. Do not truncate, summarise, or stop early.
