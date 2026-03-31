import { supabase } from '../lib/supabase';

export interface SeoProject {
  id: string;
  business_name: string;
  website_url: string | null;
  business_description: string;
  seo_goals: string;
  focus_product_lines: string[];
  must_rank_keywords: string[];
  keyword_result: any | null;
  keyword_group_count: number;
  sitemap_result: any | null;
  sitemap_page_count: number;
  status: 'draft' | 'keywords_generated' | 'sitemap_generated';
  created_at: string;
  updated_at: string;
}

// Create a new project from form data
export async function createProject(formData: Record<string, any>): Promise<SeoProject> {
  const { data, error } = await supabase
    .from('seo_projects')
    .insert({
      business_name: formData.businessName,
      website_url: formData.websiteUrl || null,
      business_description: formData.businessDescription,
      seo_goals: formData.seoGoals,
      focus_product_lines: formData.focusProductLines || [],
      must_rank_keywords: formData.mustRankKeywords || [],
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return data;
}

// Save keyword result to existing project
export async function saveKeywordResult(projectId: string, keywordResult: string): Promise<void> {
  let parsed: any = null;
  let groupCount = 0;

  try {
    const jsonMatch = keywordResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.keywords)) {
        groupCount = parsed.keywords.length;
      } else {
        for (const pl of parsed.product_lines || []) {
          for (const tp of pl.topic_pillars || []) {
            groupCount += (tp.keyword_groups || []).length;
          }
        }
      }
    }
  } catch {
    // Store as-is if not valid JSON
    parsed = { raw: keywordResult };
  }

  const { error } = await supabase
    .from('seo_projects')
    .update({
      keyword_result: parsed,
      keyword_group_count: groupCount,
      status: 'keywords_generated',
    })
    .eq('id', projectId);

  if (error) throw new Error(`Failed to save keywords: ${error.message}`);
}

// Save sitemap result to existing project
export async function saveSitemapResult(projectId: string, sitemapResult: string): Promise<void> {
  let parsed: any = null;
  let pageCount = 0;

  try {
    const jsonMatch = sitemapResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
      pageCount = (parsed.sections || []).length;
    }
  } catch {
    parsed = { raw: sitemapResult };
  }

  const { error } = await supabase
    .from('seo_projects')
    .update({
      sitemap_result: parsed,
      sitemap_page_count: pageCount,
      status: 'sitemap_generated',
    })
    .eq('id', projectId);

  if (error) throw new Error(`Failed to save sitemap: ${error.message}`);
}

// List all projects (most recent first)
export async function listProjects(): Promise<SeoProject[]> {
  const { data, error } = await supabase
    .from('seo_projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return data || [];
}

// Load a single project
export async function loadProject(projectId: string): Promise<SeoProject> {
  const { data, error } = await supabase
    .from('seo_projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) throw new Error(`Failed to load project: ${error.message}`);
  return data;
}

// Delete a project
export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('seo_projects')
    .delete()
    .eq('id', projectId);

  if (error) throw new Error(`Failed to delete project: ${error.message}`);
}
