# Keyword Expansion Flow Structure

โครงใหม่แยกจาก workflow เดิมเพื่อไม่ให้ชนกับ `keyword generate -> sitemap`

## Frontend

- `src/pages/KeywordExpansionPage.tsx`
  - หน้าแยกสำหรับ Step 2 flow
- `src/features/keyword-expansion/types.ts`
  - types ของ job, result, summary
- `src/features/keyword-expansion/api.ts`
  - HTTP client สำหรับ Render/FastAPI Step 2 service
- `src/features/keyword-expansion/supabase.ts`
  - query สำหรับ schema ใหม่ใน Supabase

## Routing

- เพิ่ม route แยกที่ `/keyword-expansion`
- ไม่แตะ logic เดิมใน `src/App.tsx`

## Integration Direction

1. `seo_projects` ยังเป็น root business context
2. Step 1 จะสร้าง seed keywords จาก business context
3. Step 2 page/service จะส่ง seed + competitor + client website ไปที่ FastAPI service
4. ถ้ามี `project_id` และ Step 2 service มี Supabase env พร้อม ผลลัพธ์จะถูก save ลง:
   - `keyword_expansion_runs`
   - `keyword_expansion_seeds`
   - `keyword_expansion_competitors`
   - `keyword_expansion_keywords`
   - `keyword_expansion_keyword_sources`
5. Step 3 ค่อยอ่านจาก schema นี้ไปทำ selection / clustering ต่อ
