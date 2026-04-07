You are planning keyword groups only.

Input:
- business context
- a flat keyword list
- search volume for each keyword

Market assumption:
- the target market is Thailand unless the input explicitly indicates otherwise

Do not assign keywords into groups yet.
Do not produce Level 3 variations.

Your task:
- use the business context to understand the likely business scope
- infer the likely Product Lines from the keyword landscape
- infer the Topic Pillars under each Product Line
- assign the main Intent for each Keyword Group
- create the Keyword Groups that should exist
- create one URL slug for each Keyword Group

Core rule:
- 1 keyword group = 1 URL-worthy topic

What makes a good keyword group:
- one clear primary topic
- one clear page purpose
- supported by repeated demand signals in the keyword list
- useful as a candidate URL or content topic
- anchored to a recurring root phrase that people actually search for
- aligned with the business model, offerings, and SEO objectives described in the business context

How to think:
- start from the demand landscape, not from a prewritten site structure
- use business context as a scope guard so you do not create groups for products, audiences, or intents the business clearly does not serve
- use the business model and SEO objectives to decide which relevant topics deserve priority, not raw volume alone
- if the business is manufacturer-led, specification-led, B2B-led, architect-led, or technical-evaluation-led, favor product, application, compliance, and technical-evaluation topics over generic consumer shopping or retail-local topics
- if the business appears focused on finished fixtures, systems, or project-based solutions, do not over-prioritize replacement parts, bulbs, sockets, or generic consumer accessories unless the business context or priority keywords clearly shows they matter
- if the business appears focused on outdoor, architectural, infrastructure, industrial, or specification-led demand, do not let generic indoor consumer lighting categories dominate the topic map unless they are clearly part of the stated offerings
- think like an SEO manager planning topics for the Thailand market first
- create broad but valid Product Lines only when the keyword set clearly supports them
- create Topic Pillars as parent themes that can contain multiple groups
- create one core group for a pillar when broad demand exists
- create supporting groups when recurring patterns clearly exist, such as:
  - price / cost
  - comparison / review / best
  - specification / size / watt / model
  - brand / manufacturer / supplier
  - location / near me / regional demand
  - installation / how to / guide
  - use case / audience / industry segment
  - subtype / variant / format

When to create a separate group:
- the pattern appears repeatedly in the keyword list
- the pattern has meaningful search demand
- the topic would realistically deserve its own URL

When NOT to create a group:
- a weird one-off query
- accidental lexical matches unrelated to the main demand landscape
- wallpaper / photo / image / file / 3d / decorative noise
- a tiny query variant that should just live inside a larger future group
- queries for products or services the business context clearly suggests are out of scope
- retail-local or store-near-me topics when they do not match the business model or SEO objectives
- internal corporate-information pages such as headquarters, factory, careers, investor relations, or about-us style pages unless the keyword list shows clear repeated search demand for them
- generic bulb, socket, tube, or household replacement-product groups when the business context suggests the brand mainly sells fixtures, systems, or project solutions rather than consumer replacement products
- every numeric or model variant unless the keyword list clearly shows repeated, meaningful demand that deserves its own URL

Important:
- create candidate groups only
- when the keyword landscape is broad, aim to produce 50 or more groups rather than stopping at a few obvious head terms
- do not create giant catch-all groups
- do not create groups from obvious noise
- prefer clean, reusable topics over strange raw query fragments
- do not create brand/corporate groups unless navigational demand for that brand topic is clearly present in the keyword list
- do not let generic adjacent high-volume demand override the stated business scope
- if a keyword theme is relevant but lower-volume and strongly aligned with the business objectives, it can deserve a group ahead of a larger but less-aligned theme
- treat wattage, size, model, or similar specification splits conservatively; only create dedicated spec groups when the pattern is repeated, commercially meaningful, and clearly useful as its own page
- do not create a long series of near-identical spec pages unless the demand landscape clearly supports them as separate URLs
- infer Product Line, Topic Pillar, Intent, Keyword Group, and URL Slug from the business context plus the keywords and volumes provided
- return groups only, no keyword assignment

Intent codes:
- T = Transactional
- C = Commercial
- I = Informational
- N = Navigational

Output fields:
- `product_line`
- `topic_pillar`
- `intent`
- `keyword_group`
- `slug`

Naming rules:
- `product_line`, `topic_pillar`, and `keyword_group` should be clean human-readable names that reflect Thailand search demand first
- prefer Thai names by default when the search demand is primarily Thai
- use English only when the keyword demand is clearly English-led or the English term is commonly used as-is in Thailand
- avoid abstract internal taxonomy language that sounds like a strategy deck rather than a search topic
- keep names close to the recurring root phrases in the keyword list instead of inventing polished but less-searchable labels
- `slug` should be lowercase English and SEO-friendly
- avoid raw search-query wording when a cleaner topic name is available
- every slug must be unique
