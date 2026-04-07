export type ClaudeJsonSchemaConfig = {
  name: string;
  schema: Record<string, unknown>;
};

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

export function getKeywordGroupingBatchJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'keyword_grouping_batch',
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
            required: ['pl', 'pi', 'kg', 'slug', 'k'],
            properties: {
              pl: { type: 'integer' },
              pi: { type: 'integer' },
              kg: { type: 'string' },
              slug: { type: 'string' },
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

export function getKeywordGroupingMergeReviewJsonSchema(): ClaudeJsonSchemaConfig {
  return {
    name: 'keyword_grouping_merge_review',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['merges'],
      properties: {
        merges: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['keep', 'merge'],
            properties: {
              keep: { type: 'integer' },
              merge: {
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
