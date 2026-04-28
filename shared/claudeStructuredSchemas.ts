export type ClaudeJsonSchemaConfig = {
  name: string;
  schema: Record<string, unknown>;
};

export function getTopicUniverseJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'topic_universe',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['dimension_name', 'what_it_covers', 'example_search_queries', 'primary_intent'],
            properties: {
              dimension_name: { type: 'string' },
              what_it_covers: { type: 'string' },
              example_search_queries: {
                type: 'array',
                items: { type: 'string' },
              },
              primary_intent: {
                type: 'string',
                enum: ['T', 'C', 'I', 'N'],
              },
            },
          },
        },
      },
    },
  };
}

export function getSitemapRowsJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'sitemap_rows',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'section',
              'sub_section_or_category',
              'page_title',
              'slug_and_path',
              'dimension_name',
              'page_type',
              'keyword_group',
              'l3_suggested_keywords',
              'source',
            ],
            properties: {
              section: { type: 'string' },
              sub_section_or_category: { type: 'string' },
              page_title: { type: 'string' },
              slug_and_path: { type: 'string' },
              dimension_name: { type: 'string' },
              page_type: {
                type: 'string',
                enum: [
                  'Homepage',
                  'Category Page',
                  'Service Page',
                  'Location Page',
                  'Comparison Page',
                  'Guide',
                  'FAQ',
                  'Calculator / Tool',
                  'Brand/Provider Page',
                  'Lead Form',
                  'Supporting Page',
                ],
              },
              keyword_group: { type: 'string' },
              l3_suggested_keywords: {
                type: 'array',
                items: { type: 'string' },
              },
              source: {
                type: 'string',
                enum: ['topic_page', 'business_page'],
              },
            },
          },
        },
      },
    },
  };
}

export function getSitemapSeedPlanJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'sitemap_seed_plan',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['seeds', 'coverage'],
      properties: {
        seeds: {
          type: 'array',
          items: { type: 'string' },
        },
        coverage: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'slug_and_path',
              'dimension_name',
              'coverage_status',
              'covering_seeds',
              'reason_if_unseeded',
            ],
            properties: {
              slug_and_path: { type: 'string' },
              dimension_name: { type: 'string' },
              coverage_status: {
                type: 'string',
                enum: ['seeded', 'intentionally_unseeded'],
              },
              covering_seeds: {
                type: 'array',
                items: { type: 'string' },
              },
              reason_if_unseeded: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

export function getSitemapMatchingJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'sitemap_matching',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['rows', 'unmatched_keywords'],
      properties: {
        unmatched_keywords: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['keyword', 'search_volume'],
            properties: {
              keyword: { type: 'string' },
              search_volume: { anyOf: [{ type: 'number' }, { type: 'string' }] },
            },
          },
        },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'section',
              'sub_section_or_category',
              'page_title',
              'slug_and_path',
              'dimension_name',
              'page_type',
              'keyword_group',
              'l3_keywords_top_5',
              'matched_keywords',
              'matching_note',
              'row_origin',
              'source',
            ],
            properties: {
              section: { type: 'string' },
              sub_section_or_category: { type: 'string' },
              page_title: { type: 'string' },
              slug_and_path: { type: 'string' },
              dimension_name: { type: 'string' },
              page_type: { type: 'string' },
              keyword_group: { type: 'string' },
              l3_keywords_top_5: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['keyword', 'search_volume'],
                  properties: {
                    keyword: { type: 'string' },
                    search_volume: { anyOf: [{ type: 'number' }, { type: 'string' }] },
                  },
                },
              },
              matched_keywords: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['keyword', 'search_volume'],
                  properties: {
                    keyword: { type: 'string' },
                    search_volume: { anyOf: [{ type: 'number' }, { type: 'string' }] },
                  },
                },
              },
              matching_note: { type: 'string' },
              row_origin: {
                type: 'string',
                enum: ['original', 'added_during_matching'],
              },
              source: {
                type: 'string',
                enum: ['topic_page', 'business_page'],
              },
            },
          },
        },
      },
    },
  };
}

export function getKeywordGroupingPlanJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'keyword_grouping_plan',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['product_lines'],
      properties: {
        product_lines: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'pillars'],
            properties: {
              name: { type: 'string' },
              pillars: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'intent'],
                  properties: {
                    name: { type: 'string' },
                    intent: {
                      type: 'string',
                      enum: ['T', 'C', 'I', 'N'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function getKeywordGroupingBlueprintJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'keyword_grouping_blueprint',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['groups'],
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['product_line', 'topic_pillar', 'intent', 'keyword_group', 'slug'],
            properties: {
              product_line: { type: 'string' },
              topic_pillar: { type: 'string' },
              intent: { type: 'string' },
              keyword_group: { type: 'string' },
              slug: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

export function getKeywordGroupingPreviewAssignmentJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'keyword_grouping_preview_assignment',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['assignments'],
      properties: {
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['g', 'k'],
            properties: {
              g: { type: 'integer' },
              k: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  };
}

export function getKeywordRelevanceFilterJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'keyword_relevance_filter',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['relevant_indexes'],
      properties: {
        relevant_indexes: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
    },
  };
}

export function getPaaSeedSelectionJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'paa_seed_selection',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['thai_seeds', 'english_seeds'],
      properties: {
        thai_seeds: {
          type: 'array',
          items: { type: 'string' },
        },
        english_seeds: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  };
}

export function getPaaBlogIdeasJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'paa_blog_ideas',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ideas'],
      properties: {
        ideas: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['blog_title', 'source', 'source_seed', 'programmatic_variables'],
            properties: {
              blog_title: { type: 'string' },
              source: { type: 'string', enum: ['PAA', 'Related Search'] },
              source_seed: { type: 'string' },
              programmatic_variables: { type: 'string' },
            },
          },
        },
      },
    },
  };
}
