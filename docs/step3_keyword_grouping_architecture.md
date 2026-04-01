# Step 3 Keyword Grouping Architecture

อ้างอิงหลักจาก [New_brielf/KeywordGrouping.md](/Users/waveconvertcake/Desktop/MARTECH-SEO/New_brielf/KeywordGrouping.md)

เป้าหมายของเอกสารนี้คือทำให้ Step 3 "ตรง brief" แต่ยังรันได้จริง ไม่ชนปัญหา token/input/output แบบที่เคยเกิดกับ sitemap

## Objective

Step 3 ต้องรับ:
- Business context
- Flat keyword list พร้อม search volume และ metrics จาก Step 2

และต้องคืน:
- Topical Authority Map แบบ CSV

โดยยังยึดกฎจาก brief:
- 1 Keyword Group = 1 Target URL
- ใช้เฉพาะ keyword และ volume ที่มีอยู่จริง
- ห้าม invent keyword หรือ volume
- ต้องมี Product Line, Topic Pillar, Pillar Intent, Keyword Group, URL Slug, Level 3 Variations
- ต้องคืน output เป็น CSV

## Why Not Single-Shot AI

ถ้าเอา expanded keyword pool ทั้งก้อนไปให้ AI จัดกลุ่มในรอบเดียว จะมีความเสี่ยงสูงเรื่อง:
- input ใหญ่มาก
- output ยาวมาก
- format CSV เพี้ยน
- token ไม่พอ
- ใช้เวลานานมาก

ดังนั้น Step 3 ควรยัง "อิง brief เดิม" แต่แยก execution ภายในเป็นหลาย phase

## Recommended Execution Model

### Phase 0: Pre-Selection

หน้าที่ของ phase นี้คือเตรียม keyword pool ก่อนเข้า AI

input:
- expanded keywords จาก Step 2
- business context
- user filters

สิ่งที่ code ทำ:
- เลือกเฉพาะ keyword ที่ user ต้องการส่งเข้า Step 3
- sort ตาม search volume
- ตัด duplicate ที่หลงเหลือ
- normalize keyword
- optional: ตัด keyword ที่ noise สูงมาก

output:
- curated flat keyword list

หมายเหตุ:
- Phase นี้ไม่เปลี่ยน brief
- แค่ทำให้ input ของ AI มีคุณภาพขึ้น

### Phase 1: Pillar Planning

ให้ AI อ่าน:
- business context
- curated flat keyword list

แล้วคืนแค่:
- Product Line candidates
- Topic Pillars
- Pillar Intent
- tentative pillar scope

output ที่คาด:
- JSON ขนาดเล็ก
- ยังไม่ใช่ CSV สุดท้าย

AI งานนี้:
- วางโครง top-level taxonomy
- ตัดสิน 1–2 product lines ที่ควรโฟกัสใน run นี้
- ระบุ pillar names ตาม core keyword logic

code validation:
- pillar name ต้องไม่ซ้ำกันใน product line เดียวกัน
- intent ต้องอยู่ใน T/C/I/N

### Phase 2: Grouping Per Pillar

ให้ AI ทำทีละ pillar

input ต่อ pillar:
- business context
- product line
- pillar name
- pillar intent
- subset ของ keywords ที่น่าจะเกี่ยวกับ pillar นี้

AI ต้องคืน:
- Keyword Groups
- URL Slugs
- Level 3 keyword variations ต่อ group

กฎ:
- 1 group = 1 URL
- keywords แต่ละคำควรอยู่ group เดียว
- slug ต้อง unique ภายใน pillar

output ต่อ pillar:
- structured JSON

เหตุผลที่ต้องแยกทีละ pillar:
- ลด input ต่อครั้ง
- ลด output ต่อครั้ง
- retry เฉพาะ pillar ที่ fail ได้

### Phase 3: Merge and Validate

code เป็นคนรวม output จากทุก pillar

สิ่งที่ code ต้อง validate:
- slug ไม่ซ้ำทั้งระบบ
- keyword ไม่ถูกใช้ซ้ำข้าม groups
- ทุก volume ต้องมาจาก Step 2 input เท่านั้น
- group name ไม่เป็น placeholder
- pillar intent ถูกต้อง

ถ้าเจอ conflict:
- flag ไว้
- หรือส่งกลับเข้า AI เฉพาะ group/slug ที่ conflict

### Phase 4: CSV Rendering

สุดท้าย code render เป็น CSV ตาม brief:

columns:
- Product Line
- Topic Pillar (Level 1)
- Pillar Intent
- Keyword Group (Level 2)
- URL Slug (Target URL)
- Keywords / Level 3 Variations (Keyword, Volume)

และต้องมี pillar divider rows ตาม format ที่ brief กำหนด

## Responsibility Split

### AI Responsibilities

- เข้าใจ business context
- วาง Product Lines
- วาง Topic Pillars
- Assign intent
- ตัดสินว่า keyword ไหนควรอยู่ group เดียวกัน
- ตั้ง Keyword Group name
- ตั้ง slug direction

### Code Responsibilities

- keyword normalization
- filtering / batching
- split per pillar
- merge results
- duplicate detection
- slug uniqueness validation
- CSV rendering
- retry / error handling

## Suggested Contracts

### Phase 1 Output

```json
{
  "product_lines": [
    {
      "name": "Fillers",
      "pillars": [
        {
          "name": "ฟิลเลอร์ปาก",
          "intent": "T"
        }
      ]
    }
  ]
}
```

### Phase 2 Output

```json
{
  "product_line": "Fillers",
  "pillar": "ฟิลเลอร์ปาก",
  "intent": "T",
  "groups": [
    {
      "keyword_group": "ฟิลเลอร์ปาก",
      "slug": "/lip-filler/",
      "keywords": [
        { "keyword": "ฟิลเลอร์ปาก", "search_volume": 5400 },
        { "keyword": "ฉีดฟิลเลอร์ปาก", "search_volume": 2900 }
      ]
    }
  ]
}
```

### Final CSV Output

ต้อง render ตาม brief เท่านั้น

## UI / Workflow Recommendation

Step 3 ใน UI ควรมีลำดับนี้:

1. Review Expanded Keywords
2. Apply filters
3. Select keywords to send to Step 3
4. Run Grouping
5. Review grouped output
6. Export CSV

## Key Risks

- keyword pool ใหญ่เกินไป
- AI assign keyword ซ้ำข้าม groups
- slug conflict
- output pillar imbalance
- output ไม่ถึง depth ที่ brief ต้องการ

## Recommended Next Implementation Step

เริ่มจาก 2 สิ่งนี้ก่อน:

1. define Step 3 input payload จาก Step 2 UI
2. build Phase 1 prompt + response contract

ยังไม่ควรเริ่มจาก full CSV generation ทันที
