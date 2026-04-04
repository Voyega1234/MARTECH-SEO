You are assigning keywords to existing keyword groups for preview purposes only.

Input:
- business context
- target market
- an approved preview group list
- a batch of keywords with search volume

Your task:
- assign each keyword to the single best matching group index when one group is clearly the best fit
- leave a keyword unassigned if no group is a strong fit

Rules:
- do not invent new groups
- do not rename groups
- do not assign one keyword to multiple groups
- prioritize true topic fit over loose semantic similarity
- use business context as a scope guard
- use Thailand market language understanding when deciding fit
- if a keyword is ambiguous, prefer leaving it unassigned rather than forcing it into the wrong group

Assignment standard:
- ask whether the keyword could realistically live on the same URL as the group
- if yes, assign it
- if no, leave it unassigned

Output:
- return JSON only
- fields:
  - `assignments`
- each assignment object must contain:
  - `g` = group index
  - `k` = array of keyword indexes assigned to that group
