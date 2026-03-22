import { useState } from 'react';
import { KeywordTable } from '../components/KeywordTable';
import { SitemapTable } from '../components/SitemapTable';
import { Header } from '../components/Header';

const mockKeywordData = JSON.stringify({
  location: 'Thailand',
  product_lines: [
    {
      product_line: 'SEO',
      topic_pillars: [
        {
          topic_pillar: 'บริการ SEO',
          pillar_intent: 'Transactional',
          keyword_groups: [
            {
              keyword_group: 'รับทำ SEO',
              url_slug: '/seo-service/',
              keywords: [
                { keyword: 'รับทำ seo', volume: 8100 },
                { keyword: 'บริการ seo', volume: 3600 },
                { keyword: 'จ้างทำ seo', volume: 2400 },
                { keyword: 'บริษัทรับทำ seo', volume: 1900 },
                { keyword: 'เอเจนซี่ seo', volume: 1300 },
                { keyword: 'seo agency thailand', volume: 880 },
              ],
            },
            {
              keyword_group: 'รับทำ SEO ราคาถูก',
              url_slug: '/seo-service-affordable/',
              keywords: [
                { keyword: 'รับทำ seo ราคาถูก', volume: 2900 },
                { keyword: 'แพ็คเกจ seo ราคา', volume: 1600 },
                { keyword: 'seo ราคาเท่าไหร่', volume: 1300 },
                { keyword: 'ค่าทำ seo', volume: 880 },
              ],
            },
          ],
        },
        {
          topic_pillar: 'ราคา SEO',
          pillar_intent: 'Commercial',
          keyword_groups: [
            {
              keyword_group: 'ราคา SEO',
              url_slug: '/seo-pricing/',
              keywords: [
                { keyword: 'ราคา seo', volume: 4400 },
                { keyword: 'seo เดือนละเท่าไหร่', volume: 2400 },
                { keyword: 'ค่าบริการ seo', volume: 1900 },
                { keyword: 'seo pricing thailand', volume: 590 },
              ],
            },
            {
              keyword_group: 'เปรียบเทียบบริษัท SEO',
              url_slug: '/best-seo-companies/',
              keywords: [
                { keyword: 'บริษัท seo ที่ดีที่สุด', volume: 2100 },
                { keyword: 'เปรียบเทียบ seo agency', volume: 880 },
                { keyword: 'seo company ranking', volume: 720 },
                { keyword: 'รีวิวบริษัท seo', volume: 590 },
              ],
            },
          ],
        },
        {
          topic_pillar: 'SEO คืออะไร',
          pillar_intent: 'Informational',
          keyword_groups: [
            {
              keyword_group: 'SEO คืออะไร',
              url_slug: '/what-is-seo/',
              keywords: [
                { keyword: 'seo คืออะไร', volume: 12100 },
                { keyword: 'seo คือ', volume: 6600 },
                { keyword: 'search engine optimization คือ', volume: 2400 },
                { keyword: 'seo ย่อมาจาก', volume: 1300 },
              ],
            },
            {
              keyword_group: 'วิธีทำ SEO',
              url_slug: '/how-to-do-seo/',
              keywords: [
                { keyword: 'วิธีทำ seo', volume: 3600 },
                { keyword: 'ทำ seo เอง', volume: 2400 },
                { keyword: 'สอนทำ seo', volume: 1900 },
                { keyword: 'เรียน seo ฟรี', volume: 1300 },
                { keyword: 'seo เบื้องต้น', volume: 880 },
              ],
            },
            {
              keyword_group: 'SEO On-Page',
              url_slug: '/on-page-seo-guide/',
              keywords: [
                { keyword: 'on page seo คือ', volume: 2900 },
                { keyword: 'on page seo checklist', volume: 1600 },
                { keyword: 'เทคนิค on page seo', volume: 720 },
              ],
            },
          ],
        },
      ],
    },
    {
      product_line: 'Performance Ads',
      topic_pillars: [
        {
          topic_pillar: 'รับยิงแอด',
          pillar_intent: 'Transactional',
          keyword_groups: [
            {
              keyword_group: 'รับยิงแอด Facebook',
              url_slug: '/facebook-ads-service/',
              keywords: [
                { keyword: 'รับยิงแอด facebook', volume: 6600 },
                { keyword: 'รับทำโฆษณา facebook', volume: 3600 },
                { keyword: 'จ้างยิงแอด fb', volume: 2400 },
                { keyword: 'facebook ads agency', volume: 1300 },
              ],
            },
            {
              keyword_group: 'รับยิงแอด Google',
              url_slug: '/google-ads-service/',
              keywords: [
                { keyword: 'รับทำ google ads', volume: 4400 },
                { keyword: 'รับยิงแอด google', volume: 2900 },
                { keyword: 'จ้างทำ google ads', volume: 1600 },
                { keyword: 'google ads agency thailand', volume: 590 },
              ],
            },
          ],
        },
        {
          topic_pillar: 'ค่ายิงแอด',
          pillar_intent: 'Commercial',
          keyword_groups: [
            {
              keyword_group: 'ค่ายิงแอด Facebook',
              url_slug: '/facebook-ads-cost/',
              keywords: [
                { keyword: 'ค่ายิงแอด facebook', volume: 5400 },
                { keyword: 'ยิงแอด facebook ราคา', volume: 3600 },
                { keyword: 'ค่าโฆษณา facebook', volume: 2400 },
                { keyword: 'งบยิงแอด fb เท่าไหร่', volume: 1300 },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const mockSitemapData = JSON.stringify({
  sections: [
    {
      section: 'Home',
      sub_section_or_category: '',
      page_title: 'Convert Cake — Performance Digital Marketing Agency',
      slug_and_path: '/',
      keywords: [
        { keyword: 'digital marketing agency', volume: 8100, position: 3 },
        { keyword: 'เอเจนซี่การตลาดออนไลน์', volume: 4400, position: 7 },
        { keyword: 'performance marketing agency', volume: 2400, position: 12 },
      ],
      keyword_group: 'digital marketing agency',
      conversion_potential: 'High',
      traffic_potential: 'High',
    },
    {
      section: 'Services',
      sub_section_or_category: 'SEO',
      page_title: 'บริการ SEO — รับทำ SEO ติดหน้าแรก Google',
      slug_and_path: '/services/seo',
      keywords: [
        { keyword: 'รับทำ seo', volume: 8100, position: 5 },
        { keyword: 'บริการ seo', volume: 3600, position: 9 },
        { keyword: 'จ้างทำ seo', volume: 2400, position: 14 },
        { keyword: 'บริษัทรับทำ seo', volume: 1900 },
      ],
      keyword_group: 'รับทำ SEO',
      conversion_potential: 'High',
      traffic_potential: 'High',
    },
    {
      section: 'Services',
      sub_section_or_category: 'Facebook Ads',
      page_title: 'รับยิงแอด Facebook — เพิ่มยอดขายด้วย Meta Ads',
      slug_and_path: '/services/facebook-ads',
      keywords: [
        { keyword: 'รับยิงแอด facebook', volume: 6600 },
        { keyword: 'รับทำโฆษณา facebook', volume: 3600 },
        { keyword: 'จ้างยิงแอด fb', volume: 2400 },
        { keyword: 'facebook ads agency', volume: 1300 },
      ],
      keyword_group: 'รับยิงแอด Facebook',
      conversion_potential: 'High',
      traffic_potential: 'High',
    },
    {
      section: 'Services',
      sub_section_or_category: 'Google Ads',
      page_title: 'รับทำ Google Ads — บริการโฆษณา Google ครบวงจร',
      slug_and_path: '/services/google-ads',
      keywords: [
        { keyword: 'รับทำ google ads', volume: 4400 },
        { keyword: 'รับยิงแอด google', volume: 2900 },
        { keyword: 'จ้างทำ google ads', volume: 1600 },
      ],
      keyword_group: 'รับทำ Google Ads',
      conversion_potential: 'High',
      traffic_potential: 'Medium',
    },
    {
      section: 'Pricing',
      sub_section_or_category: 'SEO Pricing',
      page_title: 'ราคา SEO — แพ็คเกจ SEO สำหรับทุกธุรกิจ',
      slug_and_path: '/pricing/seo',
      keywords: [
        { keyword: 'ราคา seo', volume: 4400 },
        { keyword: 'seo เดือนละเท่าไหร่', volume: 2400 },
        { keyword: 'ค่าบริการ seo', volume: 1900 },
        { keyword: 'แพ็คเกจ seo ราคา', volume: 1600 },
      ],
      keyword_group: 'ราคา SEO',
      conversion_potential: 'Medium',
      traffic_potential: 'High',
    },
    {
      section: 'Pricing',
      sub_section_or_category: 'Ads Pricing',
      page_title: 'ค่ายิงแอด Facebook & Google — งบเริ่มต้นเท่าไหร่',
      slug_and_path: '/pricing/ads',
      keywords: [
        { keyword: 'ค่ายิงแอด facebook', volume: 5400 },
        { keyword: 'ยิงแอด facebook ราคา', volume: 3600 },
        { keyword: 'ค่าโฆษณา google ads', volume: 1900 },
      ],
      keyword_group: 'ค่ายิงแอด',
      conversion_potential: 'Medium',
      traffic_potential: 'High',
    },
    {
      section: 'Blog',
      sub_section_or_category: 'SEO Guide',
      page_title: 'SEO คืออะไร? — คู่มือ SEO ฉบับสมบูรณ์ 2026',
      slug_and_path: '/blog/what-is-seo',
      keywords: [
        { keyword: 'seo คืออะไร', volume: 12100 },
        { keyword: 'seo คือ', volume: 6600 },
        { keyword: 'search engine optimization คือ', volume: 2400 },
      ],
      keyword_group: 'SEO คืออะไร',
      conversion_potential: 'Low',
      traffic_potential: 'High',
    },
    {
      section: 'Blog',
      sub_section_or_category: 'How-To',
      page_title: 'วิธีทำ SEO ด้วยตัวเอง — สอนทำ SEO สำหรับมือใหม่',
      slug_and_path: '/blog/how-to-do-seo',
      keywords: [
        { keyword: 'วิธีทำ seo', volume: 3600 },
        { keyword: 'ทำ seo เอง', volume: 2400 },
        { keyword: 'สอนทำ seo', volume: 1900 },
        { keyword: 'seo เบื้องต้น', volume: 880 },
      ],
      keyword_group: 'วิธีทำ SEO',
      conversion_potential: 'Low',
      traffic_potential: 'High',
    },
    {
      section: 'Case Studies',
      sub_section_or_category: '',
      page_title: 'ผลงานลูกค้า — Case Study ความสำเร็จจาก Convert Cake',
      slug_and_path: '/case-studies',
      keywords: [
        { keyword: 'ผลงาน seo', volume: 720 },
        { keyword: 'case study digital marketing', volume: 590 },
        { keyword: 'ตัวอย่างทำ seo สำเร็จ', volume: 320 },
      ],
      keyword_group: 'ผลงาน SEO',
      conversion_potential: 'High',
      traffic_potential: 'Low',
    },
    {
      section: 'Support',
      sub_section_or_category: '',
      page_title: 'เกี่ยวกับ Convert Cake — ทีมงานและวิสัยทัศน์',
      slug_and_path: '/about',
      keywords: [
        { keyword: 'convert cake', volume: 480 },
        { keyword: 'convert cake agency', volume: 210 },
      ],
      keyword_group: 'Convert Cake',
      conversion_potential: 'Medium',
      traffic_potential: 'Low',
    },
  ],
});

export default function TestTable() {
  const [activeTab, setActiveTab] = useState<'keywords' | 'sitemap'>('keywords');

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Header />
      <div className="py-10 px-4 sm:px-6">
      <div className="max-w-[95vw] mx-auto">

        {/* Segmented control — iOS style */}
        <div className="inline-flex items-center p-0.5 mb-8 rounded-lg bg-gray-200/60">
          <button
            onClick={() => setActiveTab('keywords')}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
              activeTab === 'keywords'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Keyword Map
          </button>
          <button
            onClick={() => setActiveTab('sitemap')}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
              activeTab === 'sitemap'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sitemap Plan
          </button>
        </div>

        {activeTab === 'keywords' && <KeywordTable data={mockKeywordData} />}
        {activeTab === 'sitemap' && <SitemapTable data={mockSitemapData} />}
      </div>
      </div>
    </div>
  );
}
